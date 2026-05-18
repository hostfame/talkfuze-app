const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
global.WebSocket = require('ws');

const USER_TOKEN = 'EAAXz3IbQJssBRe107gyGWPtFxf3ZBAttkCtjPZBpoNdbyhAoeZB8BVtqdZCqmXrQQNpZBHtzLKC7zT1yQpiCw9IHCuMRq6qqdZCHIPGgE74pbdHqaiaXvRApPaB7qPTMqdAhxr4mE4kzx8mbXXpOfNefWXZBeT7eZAwVTQKeNDZCkE8zUhDAq6EioJDjqE5uDWSafY4AKtbxw2FGNFWuT0iZCahtZBzKjV1sAxnWpq9ZB8oJkVb44KOORk9P7g6oRwAjonCcWzXLxXuxba6sP3mgOfVO';
const SUPABASE_URL = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';

async function run() {
  console.log("🚀 Starting Meta Graph API Sync...");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Fetch Pages and Instagram Accounts
  console.log("📥 Fetching pages and connected Instagram accounts for user...");
  const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${USER_TOKEN}`);
  const data = await res.json();

  if (data.error) {
    console.error("❌ Error fetching pages:", data.error);
    return;
  }

  const pages = data.data;
  console.log(`✅ Found ${pages.length} pages attached to this user.`);

  // 2. Subscribe each page and update DB
  for (const page of pages) {
    const pageId = page.id;
    const pageToken = page.access_token;
    const pageName = page.name;

    console.log(`\n⏳ Processing Page: ${pageName} (${pageId})`);

    // Subscribe
    const subRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageToken}`, {
      method: 'POST'
    });
    const subData = await subRes.json();

    if (subData.success) {
      console.log(`✅ Successfully subscribed webhook for ${pageName}`);
      
      // Check if channel exists in DB
      const { data: channels, error: fetchErr } = await supabase
        .from('channels')
        .select('*')
        .eq('type', 'messenger')
        .eq('config->>page_id', pageId);

      if (channels && channels.length > 0) {
        // Update existing channel config with new token
        const channel = channels[0];
        const newConfig = { ...channel.config, access_token: pageToken, page_name: pageName };
        const { error: updateErr } = await supabase
          .from('channels')
          .update({ config: newConfig })
          .eq('id', channel.id);
        
        if (updateErr) console.error(`❌ DB Update failed for ${pageName}:`, updateErr);
        else console.log(`💾 Updated fresh Access Token in Supabase for ${pageName}`);
      } else {
        console.log(`ℹ️ Page ${pageName} not found in TalkFuze DB. Inserting as new channel...`);
        const { error: insertErr } = await supabase
          .from('channels')
          .insert({
            org_id: 'ec2f8436-05dc-4621-8a7f-57202f865b8e', // hardcoded ORG_ID from earlier queries
            type: 'messenger',
            is_active: true,
            config: {
              page_id: pageId,
              page_name: pageName,
              access_token: pageToken
            }
          });
        if (insertErr) console.error(`❌ DB Insert failed for ${pageName}:`, insertErr);
        else console.log(`✨ Created new Messenger Channel for ${pageName}`);
      }

      // Check for Instagram Business Account
      if (page.instagram_business_account) {
        const igAccount = page.instagram_business_account;
        console.log(`📸 Found linked Instagram Account: @${igAccount.username} (${igAccount.id})`);
        
        const { data: igChannels, error: igFetchErr } = await supabase
          .from('channels')
          .select('*')
          .eq('type', 'instagram')
          .eq('config->>page_id', igAccount.id);

        if (igChannels && igChannels.length > 0) {
          const { error: igUpdateErr } = await supabase
            .from('channels')
            .update({ config: { ...igChannels[0].config, access_token: pageToken } })
            .eq('id', igChannels[0].id);
          
          if (igUpdateErr) console.error(`❌ DB Update failed for Instagram @${igAccount.username}:`, igUpdateErr);
          else console.log(`💾 Updated fresh Access Token for Instagram @${igAccount.username}`);
        } else {
          console.log(`ℹ️ Instagram @${igAccount.username} not found in TalkFuze DB. Inserting as new channel...`);
          const { error: igInsertErr } = await supabase
            .from('channels')
            .insert({
              org_id: 'ec2f8436-05dc-4621-8a7f-57202f865b8e',
              type: 'instagram',
              is_active: true,
              config: {
                page_id: igAccount.id,
                page_name: igAccount.username,
                facebook_page_id: pageId,
                access_token: pageToken
              }
            });
          if (igInsertErr) console.error(`❌ DB Insert failed for Instagram @${igAccount.username}:`, igInsertErr);
          else console.log(`✨ Created new Instagram Channel for @${igAccount.username}`);
        }
      }

    } else {
      console.error(`❌ Failed to subscribe ${pageName}:`, subData.error);
    }
  }

  console.log("\n🎉 ALL DONE!");
}

run();
