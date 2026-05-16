const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function fetchApi(path) {
  const res = await fetch(`${URL}${path}`, { headers: HEADERS });
  return await res.json();
}

async function run() {
  const contacts = await fetchApi("/contacts?order=created_at.desc&limit=2");
  console.log("Recent Contacts:", contacts.map(c => c.id + " / " + c.platform_id));
  
  const convos = await fetchApi("/conversations?order=created_at.desc&limit=5");
  console.log("\nRecent Conversations:", convos.map(c => c.id + " for contact " + c.contact_id));

  for (const conv of convos) {
    const msgs = await fetchApi(`/messages?conversation_id=eq.${conv.id}&order=created_at.asc`);
    console.log(`\nMessages for Conv ${conv.id}:`);
    msgs.forEach(m => {
      console.log(`[${m.sender_type}] ${m.content}`);
    });
  }
}
run();
