const fetch = global.fetch;

async function run() {
  const userToken = 'EAAXz3IbQJssBRdKkSPNPQCimycZCIZC9VJMZAOGo4937PZAsKlA8QJOE9W7hs0CgMc3yG8kKxZATjYEHjocKstzPQJfZC0dH6OQGqVIaiY9uRaUdqifyM4xdCagdEehjQeZC4TStw0vbwDBAi8UZAUcbZCCxBRpbumqxAfOMG6ysVo9VuC9vZCuZCHPo29JpJ1VLyhFZB2gKaQcWIAmX2dGswYXrHSo3AGEVZACj1qbZCoAtSMwQ1XaZAChpZAZBSAG9aFr4fwTkY6flhlSIOK1Bhbq6czAub';
  const supabaseUrl = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  console.log("Fetching fresh tokens from Meta...");
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${userToken}`);
  const metaData = await metaRes.json();
  const pages = metaData.data || [];

  console.log(`Found ${pages.length} pages in Meta.`);

  let igFound = false;

  for (const page of pages) {
    if (page.instagram_business_account) {
      const igId = page.instagram_business_account.id;
      // Fetch instagram handle
      const igInfoRes = await fetch(`https://graph.facebook.com/v19.0/${igId}?fields=username,name&access_token=${page.access_token}`);
      const igInfo = await igInfoRes.json();
      const igUsername = igInfo.username;
      
      console.log(`Found Instagram Account: ${igUsername} (ID: ${igId}) connected to FB Page: ${page.name}`);
      
      if (igUsername === 'hostninbd') {
        igFound = true;
        
        // Subscribe the app to the Instagram page webhook fields
        const subRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,message_echoes,messaging_handovers,standby&access_token=${page.access_token}`, {
          method: 'POST'
        });
        const subData = await subRes.json();
        console.log("Webhook subscription result:", subData);
        
        // Upsert into TalkFuze Database
        const chRes = await fetch(`${supabaseUrl}/rest/v1/channels?org_id=eq.${orgId}&type=eq.instagram`, { headers });
        const channels = await chRes.json();
        
        const existing = channels.find(c => c.config.page_id === igId);
        
        const newConfig = {
          page_id: igId,
          page_name: "Hostnin",
          access_token: page.access_token,
          facebook_page_id: page.id
        };
        
        if (existing) {
          console.log("Updating existing Instagram channel...");
          await fetch(`${supabaseUrl}/rest/v1/channels?id=eq.${existing.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ config: newConfig })
          });
        } else {
          console.log("Creating new Instagram channel...");
          await fetch(`${supabaseUrl}/rest/v1/channels`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              org_id: orgId,
              name: 'Instagram (Hostnin)',
              type: 'instagram',
              config: newConfig,
              status: 'active'
            })
          });
        }
        
        console.log("Hostnin Instagram successfully linked and webhook subscribed!");
      }
    }
  }

  if (!igFound) {
    console.log("WARNING: Did not find 'hostninbd' in the list of connected Instagram accounts.");
  }
}

run().catch(console.error);
