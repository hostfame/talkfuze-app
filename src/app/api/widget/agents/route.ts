import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/widget/agents?org_id=xxx
// Public endpoint - returns avatar URLs of active team members for an org
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const org_id = searchParams.get('org_id')

    if (!org_id) {
      return NextResponse.json({ success: false, error: 'org_id required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name, avatar_url')
      .eq('org_id', org_id)
      .eq('is_active', true)
      .not('avatar_url', 'is', null)
      .limit(10)

    if (error) {
      console.error('[Widget Agents API]', error)
      return NextResponse.json({ success: false, agents: [] })
    }

    const agents = (data || [])
      .filter((m: { avatar_url?: string | null }) => m.avatar_url && m.avatar_url.trim() !== '')
      .map((m: { id: string; name: string; avatar_url: string }) => ({
        id: m.id,
        name: m.name,
        avatar_url: m.avatar_url,
      }))

    return NextResponse.json(
      { success: true, agents },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (err) {
    console.error('[Widget Agents API] Unexpected error:', err)
    return NextResponse.json({ success: false, agents: [] })
  }
}
