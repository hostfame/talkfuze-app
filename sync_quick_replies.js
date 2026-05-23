const fs = require('fs');

// Read .env.local
const envFile = fs.readFileSync('/Users/imran/Documents/Talkfuze/.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  try {
    // 1. Fetch all quick replies
    const fetchRes = await fetch(`${url}/rest/v1/quick_replies?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch quick replies: ${fetchRes.statusText}`);
    }
    const quickReplies = await fetchRes.json();
    console.log(`Fetched ${quickReplies.length} quick replies.`);

    if (quickReplies.length === 0) {
      console.log('No quick replies to migrate.');
      return;
    }

    let successCount = 0;
    let skipCount = 0;

    // 2. Insert one-by-one to avoid batch transaction failure on single duplicate
    for (const qr of quickReplies) {
      let shortcut = qr.shortcut.trim().toLowerCase();
      if (!shortcut.startsWith('/')) {
        shortcut = '/' + shortcut;
      }
      
      const payload = {
        org_id: qr.org_id,
        shortcut: shortcut,
        content: qr.content,
        category: (qr.title || 'general').trim().toLowerCase(),
        created_at: qr.created_at
      };

      const insertRes = await fetch(`${url}/rest/v1/canned_replies`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!insertRes.ok) {
        const text = await insertRes.text();
        if (text.includes('duplicate key') || text.includes('23505')) {
          skipCount++;
        } else {
          console.error(`Failed to insert ${shortcut}:`, text);
        }
      } else {
        successCount++;
      }
    }

    console.log(`Migration complete! Successfully migrated ${successCount} replies, skipped ${skipCount} duplicates.`);
  } catch (e) {
    console.error('Migration failed:', e.message);
  }
}

main();
