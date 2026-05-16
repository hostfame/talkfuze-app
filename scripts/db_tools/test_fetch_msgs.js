const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  // Get contact for 01889877754
  const resContact = await fetch(`${URL}/contacts?platform_id=eq.01835251704&select=id`, { headers: HEADERS });
  const contacts = await resContact.json();
  if (contacts.length === 0) { console.log("Contact not found"); return; }
  
  // Get convs
  const resConvs = await fetch(`${URL}/conversations?contact_id=eq.${contacts[0].id}&select=id`, { headers: HEADERS });
  const convs = await resConvs.json();
  if (convs.length === 0) { console.log("Conv not found"); return; }
  
  // Get messages
  const resMsgs = await fetch(`${URL}/messages?conversation_id=eq.${convs[0].id}&select=*`, { headers: HEADERS });
  const msgs = await resMsgs.json();
  console.log("Messages for 01835251704:", msgs);
}
run();
