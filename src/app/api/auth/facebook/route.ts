import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // In a real SaaS, we would pass the currently logged-in user's org_id.
  // For the MVP, we use the default Hostnin org ID.
  const orgId = searchParams.get('org_id') || "ec2f8436-05dc-4621-8a7f-57202f865b8e";
  
  // The ngrok URL needs to be the base URL for the redirect
  // We can construct it dynamically based on the incoming request's host
  const host = request.headers.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;
  
  const clientId = process.env.NEXT_PUBLIC_META_APP_ID;
  
  if (!clientId) {
    return new NextResponse('Meta App ID is missing from environment variables.', { status: 500 });
  }

  // We need pages_show_list, pages_messaging, and pages_manage_metadata
  const scope = "pages_show_list,pages_messaging,pages_manage_metadata";
  
  // State is used to prevent CSRF and pass the org_id through the flow
  const state = Buffer.from(JSON.stringify({ org_id: orgId })).toString('base64');
  
  // Construct the Facebook OAuth URL
  const fbAuthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
  
  return NextResponse.redirect(fbAuthUrl);
}
