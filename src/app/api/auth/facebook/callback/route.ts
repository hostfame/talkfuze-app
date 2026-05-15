import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateStr = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return new NextResponse(`Facebook Auth Error: ${error}`, { status: 400 });
  }

  if (!code || !stateStr) {
    return new NextResponse('Missing code or state', { status: 400 });
  }

  try {
    // Parse the state to get the org_id
    const state = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf-8'));
    const orgId = state.org_id;

    const host = request.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;

    const clientId = process.env.NEXT_PUBLIC_META_APP_ID;
    const clientSecret = process.env.META_APP_SECRET;

    // 1. Exchange code for short-lived User Access Token
    const tokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token Error:", tokenData.error);
      return new NextResponse(`Token Exchange Error: ${tokenData.error.message}`, { status: 400 });
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Exchange for long-lived User Access Token
    const longTokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`);
    const longTokenData = await longTokenResponse.json();
    
    const longLivedToken = longTokenData.access_token || shortLivedToken;

    // 3. Get Pages the user manages
    const pagesResponse = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${longLivedToken}`);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      return new NextResponse(`Pages Error: ${pagesData.error.message}`, { status: 400 });
    }

    const pages = pagesData.data;

    // 4. For each page, save to database and subscribe webhook
    for (const page of pages) {
      const pageId = page.id;
      const pageName = page.name;
      const pageAccessToken = page.access_token; // This is a long-lived Page Token

      // Save to channels table
      // First check if channel exists
      const { data: existingChannel } = await supabaseAdmin
        .from('channels')
        .select('id')
        .eq('org_id', orgId)
        .eq('type', 'messenger')
        .eq('config->>page_id', pageId)
        .single();

      if (!existingChannel) {
        await supabaseAdmin.from('channels').insert({
          org_id: orgId,
          type: 'messenger',
          config: {
            page_id: pageId,
            page_name: pageName,
            access_token: pageAccessToken
          }
        });
      } else {
        await supabaseAdmin.from('channels').update({
          config: {
            page_id: pageId,
            page_name: pageName,
            access_token: pageAccessToken
          }
        }).eq('id', existingChannel.id);
      }

      // 5. Programmatically subscribe Page to Webhook
      const subscribeResponse = await fetch(`https://graph.facebook.com/v20.0/${pageId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: ['messages'],
          access_token: pageAccessToken
        })
      });
      
      const subData = await subscribeResponse.json();
      console.log(`Subscribed page ${pageName}:`, subData);
    }

    // Redirect back to Settings UI with success
    return NextResponse.redirect(`${protocol}://${host}/inbox?fb_connected=true`);

  } catch (error) {
    console.error("OAuth Callback Error:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
