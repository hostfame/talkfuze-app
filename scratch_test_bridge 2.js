const dotenv = require('dotenv');
const fs = require('fs');

const envLocal = dotenv.parse(fs.readFileSync('.env.local'));
const WHMCS_BRIDGE_URL = envLocal.WHMCS_BRIDGE_URL;
const WHMCS_BRIDGE_SECRET = envLocal.WHMCS_BRIDGE_SECRET;

async function test() {
  const formData = new URLSearchParams({
    bridge_secret: WHMCS_BRIDGE_SECRET,
    action: 'GetInvoices',
    status: 'Unpaid',
    limitnum: '5'
  });

  const response = await fetch(WHMCS_BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString()
  });

  const data = await response.json();
  console.log(JSON.stringify(data.invoices.invoice[0], null, 2));
}

test();
