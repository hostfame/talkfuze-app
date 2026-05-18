require('dotenv').config({ path: '.env.production' });
const { fetchWhmcsClient } = require('./.next/server/app/api/webhooks/calls/route.js') || {}; 
// wait, fetchWhmcsClient is in src/actions/whmcs.ts. Let's just require it using ts-node or tsx
