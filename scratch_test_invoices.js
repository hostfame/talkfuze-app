const { fetchAllWhmcsUnpaidInvoices } = require('./src/actions/whmcs');
require('dotenv').config({ path: '.env.local' });

async function test() {
  const { whmcsRequest } = await import('./src/lib/whmcs.ts'); // Can't require TS file directly in Node
}
test();
