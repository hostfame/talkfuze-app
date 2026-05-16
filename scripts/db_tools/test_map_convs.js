const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  const resContacts = await fetch(`${URL}/contacts?select=id,name`, { headers: HEADERS });
  const contacts = await resContacts.json();

  const resConvs = await fetch(`${URL}/conversations?select=id,contact_id`, { headers: HEADERS });
  const convs = await resConvs.json();
  
  const resMsgs = await fetch(`${URL}/messages?select=id,conversation_id,content`, { headers: HEADERS });
  const msgs = await resMsgs.json();

  const count = {};
  for (const m of msgs) {
    count[m.conversation_id] = (count[m.conversation_id] || 0) + 1;
  }
  
  for (const c of convs) {
    const contact = contacts.find(x => x.id === c.contact_id);
    const numMsgs = count[c.id] || 0;
    console.log(`Conv ${c.id} | Contact: ${contact?.name} | Msgs: ${numMsgs}`);
  }
}
run();
