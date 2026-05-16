const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  const convRes = await fetch(`${URL}/conversations`, { headers: HEADERS });
  const convs = await convRes.json();
  
  for (const conv of convs) {
    // get latest message
    const msgRes = await fetch(`${URL}/messages?conversation_id=eq.${conv.id}&order=created_at.desc&limit=1`, { headers: HEADERS });
    const msgs = await msgRes.json();
    if (msgs && msgs.length > 0) {
      await fetch(`${URL}/conversations?id=eq.${conv.id}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ last_message_at: msgs[0].created_at })
      });
      console.log(`Updated conv ${conv.id} with time ${msgs[0].created_at}`);
    }
  }
}
run();
