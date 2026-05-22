const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: '6b6d5c6b-9c7f-4c5c-9c9c-5c6b6d5c6b6d' }) // dummy ID, just want to see if the server errors before or after DB
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
