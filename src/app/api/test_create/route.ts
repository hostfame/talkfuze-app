import { NextResponse } from 'next/server';
import { createConversation } from '@/actions/dashboard';
import { getErrorMessage } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  try {
    const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
    const convId = await createConversation(orgId, phone);
    return NextResponse.json({ success: true, convId });
  } catch (error: unknown) {
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({ success: false, error: getErrorMessage(error), stack }, { status: 500 });
  }
}
