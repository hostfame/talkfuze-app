// Removed import
// Actually, TS file, so let's run it with ts-node or just compile it... wait, it's easier to run through the API

import fetch from 'node-fetch';

const payload = {
  contextMessages: "[Customer]: Amar hosting er nameserver ki?",
  contactName: "Imran",
  orgId: "ec2f8436-05dc-4621-8a7f-57202f865b8e",
  instruction: "",
  isTranslation: false,
  imageUrl: null,
  crmContext: {
    services: [],
    invoices: []
  }
};

async function test() {
  const res = await fetch('http://localhost:3000/api/ai/draft', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-vercel-ip-country': 'BD'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log(text);
}

test();
