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

async function query(table, select = '*') {
  const res = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to query ${table}: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  try {
    console.log('Querying quick_replies...');
    const q = await query('quick_replies');
    console.log('quick_replies count:', q.length);
    if (q.length > 0) console.log('quick_replies sample:', q.slice(0, 3));
  } catch (e) {
    console.error('quick_replies check failed:', e.message);
  }

  try {
    console.log('\nQuerying canned_replies...');
    const c = await query('canned_replies');
    console.log('canned_replies count:', c.length);
    if (c.length > 0) console.log('canned_replies sample:', c.slice(0, 3));
  } catch (e) {
    console.error('canned_replies check failed:', e.message);
  }

  try {
    console.log('\nQuerying channels with settings_quick_replies...');
    const res = await fetch(`${url}/rest/v1/channels?type=eq.settings_quick_replies&select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const ch = await res.json();
    console.log('channels settings_quick_replies count:', ch.length);
    if (ch.length > 0) {
      console.log('channels configs:', JSON.stringify(ch.map(i => i.config), null, 2));
    }
  } catch (e) {
    console.error('channels check failed:', e.message);
  }
}

main();
