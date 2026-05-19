import { NextRequest, NextResponse } from 'next/server'
import { validateLoginFast, getClientDetails } from '@/lib/whmcs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required.' }, { status: 400 })
    }

    const authRes = await validateLoginFast(email, password)

    if (authRes.result === 'success' && authRes.userid) {
      // Need to get the client details to get their name
      let name = "Support User"
      try {
        const clientRes = await getClientDetails(authRes.userid)
        if (clientRes.result === 'success' && clientRes.client) {
            const client = clientRes.client as any
            name = `${client.firstname} ${client.lastname}`.trim()
        }
      } catch (e) {
        console.error("Failed to fetch client details for name, using fallback.", e)
      }

      return NextResponse.json({
        success: true,
        clientId: authRes.userid,
        name: name
      })
    } else {
      return NextResponse.json({ success: false, error: authRes.message || 'Invalid email or password.' })
    }
  } catch (error) {
    console.error('WHMCS Widget Login Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Authentication failed.' },
      { status: 500 }
    )
  }
}
