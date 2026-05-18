const PAGE_ID = "102399628240750"; // The Facebook Page ID linked to Instagram
const ACCESS_TOKEN = "YOUR_NEW_VALID_TOKEN_HERE";

async function subscribe() {
  const res = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads'],
      access_token: ACCESS_TOKEN
    })
  });
  const data = await res.json();
  console.log(data);
}
subscribe();
