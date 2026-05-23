const https = require('https');
require('dotenv').config({ path: '.env.local' });

const options = {
  hostname: process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', ''),
  port: 443,
  path: '/rest/v1/conversations?select=id,contact:contacts(name)&limit=10',
  method: 'GET',
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { 
    const parsed = JSON.parse(data);
    const mdNurul = parsed.find(p => p.contact && p.contact.name === 'Md Nurul Islam');
    console.log(mdNurul);
  });
});
req.on('error', (e) => { console.error(e); });
req.end();
