const fetch = global.fetch;
async function run() {
  const WHMCS_BRIDGE_URL = "https://my.hostnin.com/hostnin_bridge.php";
  const WHMCS_BRIDGE_SECRET = "e58d7b1f868172449d6cf77214207cf8f2d5ea737df431f4696d4402194b27b3";
  
  const formData = new URLSearchParams({
    bridge_secret: WHMCS_BRIDGE_SECRET,
    action: 'GetClientsDetails',
    email: 'asadujjaman2027@gmail.com'
  });

  const res = await fetch(WHMCS_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  });

  console.log("GetClientsDetails:", await res.text());

  const formData2 = new URLSearchParams({
    bridge_secret: WHMCS_BRIDGE_SECRET,
    action: 'GetClients',
    search: 'asadujjaman2027@gmail.com'
  });

  const res2 = await fetch(WHMCS_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData2.toString()
  });

  console.log("GetClients:", await res2.text());
}
run();
