import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: msgs, error } = await supabaseAdmin
      .from('messages')
      .select('id, content, created_at, sender_type, platform_message_id')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) throw error;
    
    return NextResponse.json({ success: true, msgs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
