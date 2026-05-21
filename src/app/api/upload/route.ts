import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    // Auth check: require valid Supabase session
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    const fileExt = file.name ? file.name.split('.').pop() : 'png'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `agent-uploads/${fileName}`

    // Upload directly using supabaseAdmin to bypass all RLS limitations securely
    const { error: uploadError } = await supabaseAdmin.storage
      .from('media')
      .upload(filePath, file)

    if (uploadError) {
      console.error('API Upload error:', uploadError)
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('media')
      .getPublicUrl(filePath)

    return NextResponse.json({ 
      success: true, 
      url: urlData.publicUrl, 
      type: file.type, 
      name: file.name 
    })
  } catch (error: any) {
    console.error('API Upload exception:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
