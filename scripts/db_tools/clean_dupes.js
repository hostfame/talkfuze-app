const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  // Delete the empty 01889877754 conversation
  await fetch(`${URL}/conversations?id=eq.f167083c-0a8d-4df3-88b2-130a047ccd4e`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${URL}/contacts?id=eq.57e05e62-cc19-4069-8db5-fa10417330ac`, { method: 'DELETE', headers: HEADERS });

  // Delete the test 01835251704 conversation and message
  await fetch(`${URL}/messages?conversation_id=eq.b8c10692-bbf4-4854-ba22-5733dc1ad0f7`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${URL}/conversations?id=eq.b8c10692-bbf4-4854-ba22-5733dc1ad0f7`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${URL}/contacts?id=eq.bcefa0ec-421e-4737-b53b-611b2fd5bb4f`, { method: 'DELETE', headers: HEADERS });
  
  console.log("Deleted duplicates.");
}
run();
