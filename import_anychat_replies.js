const fs = require('fs');

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  
  const org_id = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';

  // Read data
  const dataPath = 'anychat_replies.json';
  if (!fs.existsSync(dataPath)) {
    console.error(`Error: File ${dataPath} not found.`);
    console.log("Please save your full JSON data to 'anychat_replies.json' in the Talkfuze directory and run this script again.");
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataPath, 'utf8');
  let replies;
  try {
    replies = JSON.parse(rawData);
  } catch (err) {
    console.error("Error parsing JSON. Make sure anychat_replies.json is valid.");
    console.error(err);
    process.exit(1);
  }

  console.log(`Found ${replies.length} replies to import.`);

  const seen = new Set();
  const uniqueReplies = [];
  for (const r of replies) {
    if (!seen.has(r.shortcut)) {
      seen.add(r.shortcut);
      uniqueReplies.push(r);
    }
  }
  
  console.log(`Found ${uniqueReplies.length} unique replies.`);

  const formattedReplies = uniqueReplies.map(r => ({
    org_id,
    shortcut: r.shortcut,
    title: r.shortcut.replace('/', ''),
    content: r.content,
    created_at: new Date(r.created_at * 1000).toISOString(),
    created_by: null
  }));

  // Batch insert using fetch
  const res = await fetch(`${url}/rest/v1/quick_replies?on_conflict=org_id,shortcut`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(formattedReplies)
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Error inserting replies:", res.status, errorText);
  } else {
    const data = await res.json();
    console.log(`Successfully imported ${data.length} quick replies!`);
  }
}

run();
