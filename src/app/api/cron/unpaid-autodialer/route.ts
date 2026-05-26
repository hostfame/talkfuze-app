import { NextResponse } from 'next/server'
import { fetchAllWhmcsUnpaidInvoices } from "@/actions/whmcs"
import { upsertUnpaidInvoiceCall } from "@/actions/unpaid-calls"

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || ''

export const dynamic = "force-dynamic"
export const revalidate = 0

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
    total_unpaid_fetched: number;
    matching_date: string;
    triggered: Array<{ invoice_id: number; phone: string; client_id: number }>;
    skipped: Array<{ invoice_id: number; reason: string }>;
    errors: string[];
  } = {
    total_unpaid_fetched: 0,
    matching_date: '',
    triggered: [],
    skipped: [],
    errors: []
  }

  try {
    // 2. Resolve current date in Bangladesh (Asia/Dhaka) timezone (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const formattedParts = formatter.formatToParts(new Date())
    const mm = formattedParts.find(p => p.type === 'month')?.value || ''
    const dd = formattedParts.find(p => p.type === 'day')?.value || ''
    const yyyy = formattedParts.find(p => p.type === 'year')?.value || ''
    const todayStr = `${yyyy}-${mm}-${dd}`
    results.matching_date = todayStr

    console.log(`[Cron Autodialer] Starting daily automated robocall run for date: ${todayStr}`)

    // 3. Fetch all unpaid invoices from WHMCS
    const invoices = await fetchAllWhmcsUnpaidInvoices()
    results.total_unpaid_fetched = invoices.length

    // 4. Filter invoices matching today's cron date
    const dailyInvoices = invoices.filter((inv: any) => inv.date === todayStr)

    // 5. Trigger robocalls sequentially with a delay buffer (2 seconds)
    for (const inv of dailyInvoices) {
      const phone = inv.client_phone || inv.phonenumber || ''
      const isPhoneValid = phone && phone.replace(/\D/g, '').length >= 10

      if (!isPhoneValid) {
        results.skipped.push({
          invoice_id: parseInt(inv.id),
          reason: `Invalid or missing phone number: "${phone}"`
        })
        continue
      }

      const cleanPhone = phone.replace(/\D/g, '')

      try {
        console.log(`[Cron Autodialer] Triggering call to ${cleanPhone} for invoice #${inv.id}`)
        
        // Trigger PBX daemon
        const response = await fetch(`http://103.174.51.123:5000/call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            phone: cleanPhone,
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

        // Update call status to Dialing in Supabase
        await upsertUnpaidInvoiceCall({
          invoice_id: parseInt(inv.id),
          client_id: parseInt(inv.userid),
          status: "Dialing"
        })

        results.triggered.push({
          invoice_id: parseInt(inv.id),
          phone: cleanPhone,
          client_id: parseInt(inv.userid)
        })

        // Delay 2 seconds between outbound triggers to be gentle on SIP trunk lines
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (err: any) {
        console.error(`[Cron Autodialer] Failed for invoice #${inv.id}:`, err.message)
        results.errors.push(`Invoice #${inv.id}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      ran_at: new Date().toISOString(),
      ...results
    })

  } catch (error: any) {
    console.error("[Cron Autodialer] Fatal execution error:", error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
