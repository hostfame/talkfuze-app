const https = require('https');
const url = 'https://my.hostnin.com/hostnin_bridge.php';

async function test() {
  const req = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'bridge_secret=Z82aX9yM1vB4cN7qW5kH0jL3fT6sP9&action=CreateSsoToken&client_id=1228&destination=sso:custom_redirect&sso_redirect_path=clientarea.php%3faction%3dproductdetails%26id%3d1130%26dosinglesignon%3d1'
  });
  const data = await req.json();
  console.log("Token Data:", data);
  
  if (data.redirect_url) {
    console.log("Fetching redirect url...");
    const res = await fetch(data.redirect_url, { redirect: 'manual' });
    console.log("Status:", res.status);
    console.log("Location:", res.headers.get('location'));
    
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      const res2 = await fetch(location.startsWith('http') ? location : 'https://my.hostnin.com' + location, { redirect: 'manual' });
      console.log("Status 2:", res2.status);
      console.log("Location 2:", res2.headers.get('location'));
    }
  }
}
test();
