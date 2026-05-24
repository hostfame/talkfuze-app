import fetch from 'node-fetch';

const payload = {
  contextMessages: "[Agent]: Ji, thik ache\n[Imran]: Hi test\n[Imran]: Amar website e error 500 dekhachhe. Ami ektu aage ekti notun plugin install korechilam WordPress e, tarpor thekei eita hochhe. Ami kivabe eita fix korbo? Ektu detail e bolen.",
  contactName: "Imran",
  orgId: "ec2f8436-05dc-4621-8a7f-57202f865b8e",
  instruction: "",
  isTranslation: false,
  imageUrl: null
};

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/ai/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log('Status:', res.status);
    
    const text = await res.text();
    console.log('Response:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
