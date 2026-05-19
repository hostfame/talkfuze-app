require('dotenv').config({ path: '.env.local' });
const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
const deviceId = "cee603f8-5130-46e6-874b-c036a1d987fb"; // using platform_id from contacts

async function run() {
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
      const cRes = await fetch(`${url}/rest/v1/contacts?org_id=eq.${orgId}&platform_type=eq.widget&platform_id=eq.${deviceId}`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
      });
      const contacts = await cRes.json();
      if (!contacts || contacts.length === 0) return console.log("No contacts");
      const contactId = contacts[0].id;
      
      const convRes = await fetch(`${url}/rest/v1/conversations?select=id,status,created_at,updated_at&contact_id=eq.${contactId}&order=created_at.desc`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
      });
      const convs = await convRes.json();
      if (!convs || convs.length === 0) return console.log("No convs");
      
      const convIds = convs.map(c => c.id);
      
      // Messages fetch
      const msgRes = await fetch(`${url}/rest/v1/messages?select=conversation_id,content,sender_type,sender_id,created_at&conversation_id=in.(${convIds.join(',')})&order=created_at.desc`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
      });
      const latestMsgs = await msgRes.json();
      
      const latestMsgByConv = {};
      if (latestMsgs && !latestMsgs.error) {
        latestMsgs.forEach(msg => {
          if (!latestMsgByConv[msg.conversation_id]) {
            latestMsgByConv[msg.conversation_id] = msg;
          }
        });
      }
      
      const agentIds = Array.from(new Set(
        Object.values(latestMsgByConv)
          .filter(m => m.sender_type === 'agent' || m.sender_type === 'system')
          .map(m => m.sender_id)
          .filter(id => id && id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      ));
      
      console.log("Agent IDs:", agentIds);
      
      const result = convs.map((c) => {
        const latestMsg = latestMsgByConv[c.id];
        return {
          ...c,
          latestMessage: latestMsg || null,
        };
      });
      
      console.log("SUCCESS! Convs:", result.length);
      console.log(result[0]);
  } catch (err) {
      console.error("CATCH ERRRR", err);
  }
}
run();
