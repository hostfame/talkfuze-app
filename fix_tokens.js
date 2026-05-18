const fetch = global.fetch;

async function run() {
  const userToken = 'EAAXz3IbQJssBRdIJ0fg5XdgQNeyVWgRa6o2PWVoPpJFZAu9akMfnlmwTF4ElYpMmU9xKusHZCjm0UmdbyH5ovaOW37PpG93aFvvklrVDNBMI5ZCdvURQy8mEodpx9qJZCNtjoWIQTgok56coiKJaNs1AuZAfPuWfTteSfjVXZBZADAkG4gvCkAMvuMVqZAOOzjtXHbcf0F0hUahz1qRz4iKjfeJzszIa3dH7RwZDZD';
  const supabaseUrl = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  // 1. Get fresh tokens from Meta
  console.log("Fetching fresh tokens from Meta...");
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${userToken}`);
  const metaData = await metaRes.json();
  const pages = metaData.data || [];

  console.log(`Found ${pages.length} pages in Meta.`);

  // 2. Fetch all channels from Supabase
  const chRes = await fetch(`${supabaseUrl}/rest/v1/channels`, { headers });
  const channels = await chRes.json();
  
  console.log(`Found ${channels.length} channels in Supabase.`);

  let updatedCount = 0;

  for (const channel of channels) {
    if (channel.type === 'messenger') {
      const pageId = channel.config.page_id;
      const metaPage = pages.find(p => p.id === pageId);
      
      if (metaPage && metaPage.access_token) {
        // Update the config with the new access_token
        const newConfig = { ...channel.config, access_token: metaPage.access_token };
        await fetch(`${supabaseUrl}/rest/v1/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ config: newConfig })
        });
        console.log(`Updated Messenger token for: ${metaPage.name}`);
        updatedCount++;
      }
    } 
    else if (channel.type === 'instagram') {
      // For Instagram, the channel config usually has the facebook_page_id or we match by instagram_business_account
      const igId = channel.config.page_id;
      const metaPage = pages.find(p => p.instagram_business_account && p.instagram_business_account.id === igId);
      
      if (metaPage && metaPage.access_token) {
        const newConfig = { ...channel.config, access_token: metaPage.access_token };
        await fetch(`${supabaseUrl}/rest/v1/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ config: newConfig })
        });
        console.log(`Updated Instagram token for: ${metaPage.name} (IG ID: ${igId})`);
        updatedCount++;
      }
    }
  }

  console.log(`\nSuccessfully updated tokens for ${updatedCount} channels!`);
}

run().catch(console.error);
