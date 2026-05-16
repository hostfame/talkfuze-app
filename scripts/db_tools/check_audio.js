const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  let res = await fetch(`${URL}/contacts?platform_id=like.%2595090626285723%25`, { headers: HEADERS });
  let contacts = await res.json();
  console.log("Contacts:", contacts);
  
  if (contacts && contacts.length > 0) {
    let convRes = await fetch(`${URL}/conversations?contact_id=eq.${contacts[0].id}`, { headers: HEADERS });
    let convs = await convRes.json();
    console.log("Convs:", convs);
    
    if (convs && convs.length > 0) {
       let msgRes = await fetch(`${URL}/messages?conversation_id=eq.${convs[0].id}`, { headers: HEADERS });
       let msgs = await msgRes.json();
       console.log("Messages count:", msgs.length, msgs.map(m => m.content));
    }
  }
}
run();
