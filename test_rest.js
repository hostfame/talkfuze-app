const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};
const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e";

async function fetchApi(path, method, body) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

async function run() {
  try {
    console.log("Checking channel...");
    let channels = await fetchApi(`/channels?org_id=eq.${ORG_ID}&type=eq.widget`, "GET");
    let channel = channels[0];
    if (!channel) {
      console.log("Creating channel...");
      const res = await fetchApi("/channels", "POST", { org_id: ORG_ID, type: "widget" });
      channel = res[0];
    }
    console.log("Channel ID:", channel.id);

    console.log("Checking contact...");
    let contacts = await fetchApi(`/contacts?org_id=eq.${ORG_ID}&platform_id=eq.test-device-id`, "GET");
    let contact = contacts[0];
    if (!contact) {
      console.log("Creating contact...");
      const res = await fetchApi("/contacts", "POST", {
        org_id: ORG_ID,
        platform_type: "widget",
        platform_id: "test-device-id",
        name: "Website Visitor"
      });
      contact = res[0];
    }
    console.log("Contact ID:", contact.id);

    console.log("Checking conversation...");
    let convos = await fetchApi(`/conversations?org_id=eq.${ORG_ID}&contact_id=eq.${contact.id}`, "GET");
    let conv = convos[0];
    if (!conv) {
      console.log("Creating conversation...");
      const res = await fetchApi("/conversations", "POST", {
        org_id: ORG_ID,
        channel_id: channel.id,
        contact_id: contact.id,
        status: "open"
      });
      conv = res[0];
    }
    console.log("Conversation ID:", conv.id);

    console.log("Inserting message...");
    const msg = await fetchApi("/messages", "POST", {
      org_id: ORG_ID,
      conversation_id: conv.id,
      sender_type: "contact",
      sender_id: contact.id,
      content: "hello world"
    });
    console.log("Message inserted:", msg[0].id);
    
  } catch (e) {
    console.error("Test failed:", e.message);
  }
}
run();
