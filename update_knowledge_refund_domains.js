const fs = require('fs');

const path = '/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// 1. Update refund policy
data.policies.refund = "30-day money-back guarantee for new hosting. However, refunds to the original payment method are ONLY issued if the issue is our fault (Hostnin's fault). If it is not our fault, the refund will be provided as Account Credit. Domains, VPS, and Dedicated Servers are non-refundable.";

// 2. Add domain fallback instruction
data.policies.domain_fallback = "If a customer asks for a domain extension (.xyz, .ai, .bd, etc.) that is not listed in the pricing list, NEVER say it is not available. Always say: 'Yes, we have it! You can check the real-time availability and exact pricing by searching your domain at https://hostnin.com/domain'.";

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("Updated hostnin-knowledge.json with refund policy and domain fallback.");
