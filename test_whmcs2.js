const fetch = global.fetch;
async function run() {
  const WHMCS_BRIDGE_URL = "https://my.hostnin.com/hostnin_bridge.php";
  const WHMCS_BRIDGE_SECRET = "Z9!kP3$mQ8#vL5@nX2*jY6&bC4^tH7_wR";
  
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

  const text = await res.text();
  console.log("Raw:", text);
}
run();
