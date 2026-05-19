import { NextResponse } from 'next/server'
import { getSupportDepartments } from '@/lib/whmcs'

export async function GET() {
  try {
    const departments = await getSupportDepartments()
    return NextResponse.json({ success: true, departments })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Departments GET]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
