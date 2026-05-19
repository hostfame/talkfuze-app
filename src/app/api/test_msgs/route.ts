import { NextResponse } from 'next/server';
import { getWidgetMessages } from '@/actions/chat';

export async function GET(request: Request) {
  const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
  const deviceId = "f328082f-2047-421e-abae-dbc11fc8cc32";
  
  const msgs = await getWidgetMessages(orgId, deviceId);
  return NextResponse.json({ msgs: msgs.slice(-3) });
}
