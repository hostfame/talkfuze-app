const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

// The issue: selectedTicket.ticketid should be selectedTicket.ticketid || selectedTicket.id
content = content.replace(
  'fetch(`/api/widget/whmcs/tickets/${selectedTicket.ticketid}/reply`',
  'fetch(`/api/widget/whmcs/tickets/${selectedTicket.id || selectedTicket.ticketid}/reply`'
);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log('Fixed ticketid');
