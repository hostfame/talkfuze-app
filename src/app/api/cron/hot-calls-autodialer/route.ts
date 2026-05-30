import { NextResponse } from 'next/server'
import { fetchWhmcsAbandonedCarts } from "@/actions/whmcs"
import { upsertUnpaidInvoiceCall } from "@/actions/unpaid-calls"
import { supabaseAdmin } from "@/lib/supabase-admin"

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || ''

export const dynamic = "force-dynamic"
export const revalidate = 0

function cleanAndValidatePhone(phone: string): string | null {
  if (!phone) return null
  // Strip non-digits
  const clean = phone.replace(/\D/g, '')
  
  // Normalize Bangladeshi numbers to local 11-digit format starting with 01
  let localNumber = clean
  if (clean.startsWith('008801') && clean.length === 14) {
    localNumber = clean.substring(3)
  } else if (clean.startsWith('8801') && clean.length === 13) {
    localNumber = clean.substring(2)
  }
  
  if (localNumber.length === 11 && localNumber.startsWith('01')) {
    // Exclude repetitive fake test numbers
    if (
      localNumber === '01000000000' || 
      localNumber === '01111111111' || 
      localNumber === '01999999999' ||
      localNumber === '01234567890'
    ) {
      return null
    }
    return localNumber
  }
  
  return null
}

export async function GET(request: Request) {
  // 1. Verify cron secret (Vercel cron or external caller)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('secret') !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const results: {
    total_abandoned_fetched: number;
    newly_scheduled: Array<{ invoice_id: number; scheduled_at: string }>;
    triggered: Array<{ invoice_id: number; phone: string; client_id: number }>;
    discarded_paid: number[];
    errors: string[];
  } = {
    total_abandoned_fetched: 0,
    newly_scheduled: [],
    triggered: [],
    discarded_paid: [],
    errors: []
  }

  try {
    console.log(`[Hot-lead Autodialer] Starting 5-minute poller run...`)

    // 2. Fetch all unpaid abandoned carts from WHMCS bridge
    const carts = await fetchWhmcsAbandonedCarts()
    results.total_abandoned_fetched = carts.length

    if (carts.length === 0) {
      return NextResponse.json({
        success: true,
        ran_at: new Date().toISOString(),
        ...results
      })
    }

    const activeInvoiceIds = new Set(carts.map((c: any) => parseInt(c.invoice_id)))
    const activeInvoiceIdsArr = Array.from(activeInvoiceIds)

    // 3. Sync and queue new abandoned carts using single bulk query
    const { data: existingRecords, error: fetchErr } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('invoice_id, status')
      .in('invoice_id', activeInvoiceIdsArr)

    if (fetchErr) {
      throw new Error(`Failed to query existing records: ${fetchErr.message}`)
    }

    const existingMap = new Map(existingRecords?.map((r: any) => [parseInt(r.invoice_id), r.status]) || [])

    // Guardrail: Only sync carts created in the last 2 hours to avoid dialing old historical carts
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const toInsert = []

    for (const cart of carts) {
      const invoiceId = parseInt(cart.invoice_id)
      const clientId = parseInt(cart.client_id)

      if (!existingMap.has(invoiceId)) {
        const createdAtStr = cart.created_at || ''
        if (!createdAtStr) continue

        // Convert creation time to Date (stored as BDT, UTC+6)
        const createdAtDate = new Date(createdAtStr.replace(' ', 'T') + '+06:00')
        
        // Skip historical carts to prevent autodialer explosion
        if (createdAtDate < twoHoursAgo) {
          continue
        }

        // Validate phone number before scheduling
        const phone = cart.client_phone || cart.phonenumber || ''
        const validatedPhone = cleanAndValidatePhone(phone)
        if (!validatedPhone) {
          // Store in DB as failed immediately so we don't scan it again
          toInsert.push({
            invoice_id: invoiceId,
            client_id: clientId,
            status: 'Failed',
            call_type: 'hot',
            notes: 'Invalid phone number format: ' + phone,
            updated_at: new Date().toISOString()
          })
          continue
        }

        const scheduledDate = new Date(createdAtDate.getTime() + 60 * 60 * 1000)
        const scheduledAtISO = scheduledDate.toISOString()

        toInsert.push({
          invoice_id: invoiceId,
          client_id: clientId,
          status: 'Scheduled',
          call_type: 'hot',
          scheduled_at: scheduledAtISO,
          updated_at: new Date().toISOString()
        })

        results.newly_scheduled.push({
          invoice_id: invoiceId,
          scheduled_at: scheduledAtISO
        })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('unpaid_invoice_calls')
        .insert(toInsert)

      if (insertErr) {
        throw new Error(`Failed to bulk insert scheduled calls: ${insertErr.message}`)
      }
    }

    // 4. Handle Paid / Discarded calls:
    // Any record in Supabase with status = 'Scheduled' and call_type = 'hot'
    // whose invoice_id is NOT in activeInvoiceIds is paid/cancelled.
    const { data: scheduledCalls, error: schedErr } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('invoice_id')
      .eq('status', 'Scheduled')
      .eq('call_type', 'hot')

    if (schedErr) {
      throw new Error(`Failed to query scheduled calls: ${schedErr.message}`)
    }

    if (scheduledCalls && scheduledCalls.length > 0) {
      for (const call of scheduledCalls) {
        const invId = parseInt(call.invoice_id)
        if (!activeInvoiceIds.has(invId)) {
          const updateRes = await upsertUnpaidInvoiceCall({
            invoice_id: invId,
            client_id: 0,
            status: 'Paid'
          })
          if (updateRes.success) {
            results.discarded_paid.push(invId)
          } else {
            results.errors.push(`Failed to update status to Paid for invoice #${invId}: ${updateRes.error}`)
          }
        }
      }
    }

    // 5. Trigger matured calls:
    // Get all records where status = 'Scheduled', call_type = 'hot', and scheduled_at <= now()
    const nowStr = new Date().toISOString()
    const { data: maturedCalls, error: maturedErr } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('*')
      .eq('status', 'Scheduled')
      .eq('call_type', 'hot')
      .lte('scheduled_at', nowStr)

    if (maturedErr) {
      throw new Error(`Failed to query matured calls: ${maturedErr.message}`)
    }

    if (maturedCalls && maturedCalls.length > 0) {
      for (const call of maturedCalls) {
        const invId = parseInt(call.invoice_id)
        
        // Find matching cart to get client phone
        const matchingCart = carts.find((c: any) => parseInt(c.invoice_id) === invId)
        if (!matchingCart) {
          continue
        }

        const phone = matchingCart.client_phone || matchingCart.phonenumber || ''
        const validatedPhone = cleanAndValidatePhone(phone)

        if (!validatedPhone) {
          await upsertUnpaidInvoiceCall({
            invoice_id: invId,
            client_id: parseInt(call.client_id),
            status: 'Failed',
            notes: 'Invalid phone number format during trigger: ' + phone
          })
          results.errors.push(`Matured invoice #${invId}: Invalid phone "${phone}"`)
          continue
        }

        try {
          console.log(`[Hot-lead Autodialer] Triggering mature hot call to ${validatedPhone} for invoice #${invId}`)
          
          const response = await fetch(`http://103.174.51.123:5000/call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              phone: validatedPhone,
              secret: "tf_worker_sec_x9k2m7pQwR4nVhJ8"
            })
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
          }

          const resData = await response.json()
          if (!resData.success) {
            throw new Error("Daemon returned success=false")
          }

          await upsertUnpaidInvoiceCall({
            invoice_id: invId,
            client_id: parseInt(call.client_id),
            status: "Dialing"
          })

          results.triggered.push({
            invoice_id: invId,
            phone: validatedPhone,
            client_id: parseInt(call.client_id)
          })

          await new Promise(resolve => setTimeout(resolve, 2000))

        } catch (err: any) {
          console.error(`[Hot-lead Autodialer] Trigger failed for invoice #${invId}:`, err.message)
          results.errors.push(`Invoice #${invId}: ${err.message}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      ran_at: new Date().toISOString(),
      ...results
    })

  } catch (error: any) {
    console.error("[Hot-lead Autodialer] Fatal execution error:", error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
