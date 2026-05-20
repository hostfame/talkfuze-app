const https = require('https');
require('dotenv').config({ path: '.env.local' });

const options = {
  hostname: process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', ''),
  path: '/rest/v1/organizations?select=id,name,settings',
  method: 'GET',
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Organizations:', data));
});
req.on('error', e => console.error(e));
req.end();
