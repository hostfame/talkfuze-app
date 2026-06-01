require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

async function migrate() {
  console.log("Fetching from quick_replies...");
  const fetchRes = await fetch(`${supabaseUrl}/rest/v1/quick_replies?select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const quickReplies = await fetchRes.json();

  if (!quickReplies || quickReplies.length === 0) {
    console.log("No replies found in quick_replies.");
    return;
  }
  
  console.log(`Found ${quickReplies.length} replies in quick_replies.`);

  let insertedCount = 0;
  for (const qr of quickReplies) {
    const toInsert = {
      org_id: qr.org_id,
      shortcut: qr.shortcut.startsWith('/') ? qr.shortcut : `/${qr.shortcut}`,
      content: qr.content,
      category: 'general' 
    };

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/canned_replies?on_conflict=org_id,shortcut`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(toInsert)
    });

    if (insertRes.ok) {
      insertedCount++;
    } else {
      console.error(`Failed to insert ${qr.shortcut}:`, await insertRes.text());
    }
  }

  console.log(`Successfully migrated ${insertedCount} replies!`);
  
  // Delete migrated records
  const ids = quickReplies.map(qr => qr.id).join(',');
  const deleteRes = await fetch(`${supabaseUrl}/rest/v1/quick_replies?id=in.(${ids})`, {
    method: 'DELETE',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
    
  if (!deleteRes.ok) {
    console.error("Failed to delete migrated records from quick_replies:", await deleteRes.text());
  } else {
    console.log("Cleaned up quick_replies table.");
  }
}

migrate();
