const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  const convRes = await fetch(`${URL}/conversations?contact_id=eq.ca968e59-3656-4842-bd5a-37089a4220ec`, { headers: HEADERS });
  const conv = await convRes.json();
  const convId = conv[0].id;
  
  const msgRes = await fetch(`${URL}/messages?conversation_id=eq.${convId}`, { headers: HEADERS });
  const msgs = await msgRes.json();
  console.log("RED TAB (LID) msgs:", msgs.map(m => m.content));
  
  const convRes2 = await fetch(`${URL}/conversations?contact_id=eq.9570eb1a-30c2-482f-b35b-3be3d1505247`, { headers: HEADERS });
  const conv2 = await convRes2.json();
  const convId2 = conv2[0].id;
  
  const msgRes2 = await fetch(`${URL}/messages?conversation_id=eq.${convId2}`, { headers: HEADERS });
  const msgs2 = await msgRes2.json();
  console.log("PURPLE TAB (GROUP) msgs:", msgs2.map(m => m.content));
}
run();
