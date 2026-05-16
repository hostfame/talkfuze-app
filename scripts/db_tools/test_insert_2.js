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
  const phone = "01835251704";
  
  // 1. Insert contact
  const res = await fetch(`${URL}/contacts`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      org_id: orgId,
      platform_id: phone,
      name: phone,
      status: "active"
    })
  });
  console.log("Insert Contact Status:", res.status);
  console.log("Insert Contact Body:", await res.text());
}
run();
