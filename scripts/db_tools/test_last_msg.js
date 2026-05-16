const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
  
  const res = await fetch(`${URL}/conversations?org_id=eq.${orgId}&select=id,contact:contacts(name),messages(content,sender_type)&messages.order=created_at.desc&messages.limit=1`, {
    headers: HEADERS
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Data:", JSON.stringify(data.slice(0, 3), null, 2));
}
run();
