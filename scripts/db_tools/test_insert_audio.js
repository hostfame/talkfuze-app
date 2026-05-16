const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

async function run() {
  let res = await fetch(`${URL}/messages`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      org_id: "ec2f8436-05dc-4621-8a7f-57202f865b8e",
      conversation_id: "142f76e9-ffd6-44c8-a952-b9a4ccb88085",
      sender_type: "contact",
      sender_id: "1b12759a-967f-41fe-bd1a-49962da72454",
      content: "[Audio Voice Message]",
      content_type: "audio",
      platform_message_id: "TEST_AUDIO_1"
    })
  });
  console.log("Insert Response:", res.status, await res.text());
}
run();
