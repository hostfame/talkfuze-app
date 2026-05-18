/**
 * Backfill contact profiles from Meta Graph API.
 * Enriches all contacts with names like "FB User XXXX" or "Instagram User XXXX"
 * with real names, usernames and profile pictures now that the app is Live.
 */

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1';
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const h = { 'apikey': apikey, 'Authorization': 'Bearer '+apikey, 'Content-Type': 'application/json' };

  // Get all channels with their tokens
  const chanRes = await fetch(url+'/channels?type=in.(messenger,instagram)&is_active=eq.true&select=*', { headers: h });
  const channels = await chanRes.json();

  // Build a lookup: page_id -> access_token
  const tokenMap = {};
  const channelByType = {};
  for (const ch of channels) {
    const pageId = ch.config?.page_id;
    if (pageId && ch.config?.access_token) {
      tokenMap[pageId] = { token: ch.config.access_token, type: ch.type, fbPageId: ch.config.facebook_page_id };
      channelByType[ch.type] = { token: ch.config.access_token, fbPageId: ch.config.facebook_page_id };
    }
  }

  // Get contacts that still have default names OR no avatar
  const contactsRes = await fetch(
    url+'/contacts?or=(name.ilike.*FB User*,name.ilike.*Instagram User*)&select=id,name,platform_id,platform_type',
    { headers: h }
  );
  const contacts = await contactsRes.json();
  console.log(`Found ${contacts.length} contacts to enrich...`);

  let enriched = 0;
  let failed = 0;

  for (const contact of contacts) {
    const { id, platform_id, platform_type, name } = contact;
    
    // Find the best token to use
    let token = null;
    if (platform_type === 'instagram') {
      // Use instagram channel token
      const igCh = channels.find(c => c.type === 'instagram' && c.is_active);
      token = igCh?.config?.access_token;
    } else if (platform_type === 'messenger') {
      // Try to find matching token or use any messenger token
      const msgCh = channels.find(c => c.type === 'messenger' && c.is_active);
      token = msgCh?.config?.access_token;
    }
    
    if (!token) { failed++; continue; }

    try {
      let newName = null;
      let avatarUrl = null;

      if (platform_type === 'instagram') {
        const igRes = await fetch(`https://graph.facebook.com/v20.0/${platform_id}?fields=name,username,profile_pic&access_token=${token}`);
        const ig = await igRes.json();
        if (!ig.error) {
          if (ig.username) newName = `@${ig.username}`;
          else if (ig.name) newName = ig.name;
          console.log(`  IG ${platform_id}: ${ig.username || ig.name || 'no name'}`);
        } else {
          console.log(`  IG ${platform_id}: API error - ${ig.error.message}`);
        }
      } else {
        // Messenger
        const fbRes = await fetch(`https://graph.facebook.com/v20.0/${platform_id}?fields=first_name,last_name,profile_pic&access_token=${token}`);
        const fb = await fbRes.json();
        if (!fb.error) {
          if (fb.first_name || fb.last_name) {
            newName = `${fb.first_name || ''} ${fb.last_name || ''}`.trim();
          }
          console.log(`  FB ${platform_id}: ${newName || 'no name'}`);
        } else {
          console.log(`  FB ${platform_id}: API error - ${fb.error.message}`);
        }
      }

      if (newName && newName !== name) {
        await fetch(url+'/contacts?id=eq.'+id, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ name: newName })
        });
        enriched++;
      }
    } catch (e) {
      failed++;
      console.error(`  Failed ${id}:`, e.message);
    }

    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. Enriched: ${enriched}, Failed/Skipped: ${failed}`);
}

run();
