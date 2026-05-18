const fetch = global.fetch;

async function run() {
  const userToken = 'EAAXz3IbQJssBRdKkSPNPQCimycZCIZC9VJMZAOGo4937PZAsKlA8QJOE9W7hs0CgMc3yG8kKxZATjYEHjocKstzPQJfZC0dH6OQGqVIaiY9uRaUdqifyM4xdCagdEehjQeZC4TStw0vbwDBAi8UZAUcbZCCxBRpbumqxAfOMG6ysVo9VuC9vZCuZCHPo29JpJ1VLyhFZB2gKaQcWIAmX2dGswYXrHSo3AGEVZACj1qbZCoAtSMwQ1XaZAChpZAZBSAG9aFr4fwTkY6flhlSIOK1Bhbq6czAub';
  const supabaseUrl = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const metaRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${userToken}`);
  const metaData = await metaRes.json();
  const pages = metaData.data || [];

  const chRes = await fetch(`${supabaseUrl}/rest/v1/channels`, { headers });
  const channels = await chRes.json();
  
  let updatedCount = 0;

  for (const channel of channels) {
    if (channel.type === 'messenger') {
      const pageId = channel.config.page_id;
      const metaPage = pages.find(p => p.id === pageId);
      
      if (metaPage && metaPage.access_token) {
        const newConfig = { ...channel.config, access_token: metaPage.access_token };
        await fetch(`${supabaseUrl}/rest/v1/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ config: newConfig })
        });
        updatedCount++;
      }
    } 
    else if (channel.type === 'instagram') {
      const igId = channel.config.page_id;
      const metaPage = pages.find(p => p.instagram_business_account && p.instagram_business_account.id === igId);
      
      if (metaPage && metaPage.access_token) {
        const newConfig = { ...channel.config, access_token: metaPage.access_token };
        await fetch(`${supabaseUrl}/rest/v1/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ config: newConfig })
        });
        updatedCount++;
      }
    }
  }

  console.log(`Updated tokens for ${updatedCount} channels using the NEW token!`);
}

run().catch(console.error);
