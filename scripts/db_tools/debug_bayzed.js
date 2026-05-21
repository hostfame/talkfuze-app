const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  console.log("Searching for contact Bayzed Bostami...");
  const resContact = await fetch(`${URL}/contacts?name=ilike.*Bayzed*&select=*`, { headers: HEADERS });
  const contacts = await resContact.json();
  console.log("Contacts matching 'Bayzed':", JSON.stringify(contacts, null, 2));

  if (contacts.length > 0) {
    const contactId = contacts[0].id;
    const resConvs = await fetch(`${URL}/conversations?contact_id=eq.${contactId}&select=*`, { headers: HEADERS });
    const convs = await resConvs.json();
    console.log("Conversations:", JSON.stringify(convs, null, 2));

    if (convs.length > 0) {
      const convId = convs[0].id;
      const resMsgs = await fetch(`${URL}/messages?conversation_id=eq.${convId}&select=*&order=created_at.desc&limit=5`, { headers: HEADERS });
      const msgs = await resMsgs.json();
      console.log("Recent Messages:", JSON.stringify(msgs, null, 2));
    }
  }
}
run();
