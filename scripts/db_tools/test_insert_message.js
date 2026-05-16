const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

async function run() {
  const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
  const convId = "b8c10692-bbf4-4854-ba22-5733dc1ad0f7"; // using an existing convId
  
  const res = await fetch(`${URL}/messages`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      org_id: orgId,
      conversation_id: convId,
      sender_type: "agent",
      sender_id: "agent-1",
      content: "Test message",
      content_type: "text",
      metadata: {},
      is_internal: false
    })
  });
  console.log("Insert Message Status:", res.status);
  console.log("Insert Message Body:", await res.text());
}
run();
