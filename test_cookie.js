const fs = require('fs');
const env = require('dotenv').parse(fs.readFileSync('.env.local'));
const https = require('https');
const http = require('http');

async function getFinalUrl(initialUrl) {
  return new Promise((resolve, reject) => {
    let cookies = [];
    
    function request(url) {
      const parsedUrl = new URL(url);
      const mod = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        method: 'GET',
        headers: {
          'Cookie': cookies.join('; '),
          'User-Agent': 'Mozilla/5.0'
        }
      };
      
      const req = mod.request(parsedUrl, options, (res) => {
        if (res.headers['set-cookie']) {
          res.headers['set-cookie'].forEach(c => cookies.push(c.split(';')[0]));
        }
        
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = parsedUrl.origin + (nextUrl.startsWith('/') ? '' : '/') + nextUrl.replace(/&amp;/g, '&');
          } else {
             nextUrl = nextUrl.replace(/&amp;/g, '&');
          }
          console.log('Redirecting to:', nextUrl);
          request(nextUrl);
        } else {
          resolve(url);
        }
      });
      req.on('error', reject);
      req.end();
    }
    
    request(initialUrl);
  });
}

async function test() {
  const req = await fetch(env.WHMCS_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'bridge_secret=' + env.WHMCS_BRIDGE_SECRET + '&action=CreateSsoToken&client_id=1228&destination=sso:custom_redirect&sso_redirect_path=clientarea.php%3faction%3dproductdetails%26id%3d1130%26dosinglesignon%3d1'
  });
  const data = await req.json();
  if (data.redirect_url) {
    const finalUrl = await getFinalUrl(data.redirect_url);
    console.log('Final URL:', finalUrl);
  }
}
test();
