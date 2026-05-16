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
  console.log("Contacts:", contacts);

  const resConvs = await fetch(`${URL}/conversations?select=id,contact_id`, { headers: HEADERS });
  const convs = await resConvs.json();
  
  const resMsgs = await fetch(`${URL}/messages?select=id,conversation_id,content`, { headers: HEADERS });
  const msgs = await resMsgs.json();

  console.log("Total Messages in DB:", msgs.length);
  
  // print out how many messages per conversation
  const count = {};
  for (const m of msgs) {
    count[m.conversation_id] = (count[m.conversation_id] || 0) + 1;
  }
  console.log("Message counts per conversation:", count);
}
run();
