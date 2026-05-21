require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const WHMCS_BRIDGE_URL = process.env.WHMCS_BRIDGE_URL || 'https://my.hostnin.com/hostnin_bridge.php';
const WHMCS_BRIDGE_SECRET = process.env.WHMCS_BRIDGE_SECRET || '';

async function whmcsRequest(action, params = {}) {
  const formData = new URLSearchParams({
    bridge_secret: WHMCS_BRIDGE_SECRET,
    action,
    ...params
  });

  const response = await fetch(WHMCS_BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'HostninPortal/1.0'
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`WHMCS Bridge HTTP Error: ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Non-JSON response:", text.substring(0, 500));
    throw new Error("WHMCS non-JSON response");
  }
}

async function run() {
  console.log("Fetching contacts named 'Hostnin'...");
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('name', 'Hostnin')
    .eq('platform_type', 'whatsapp');

  if (error) {
    console.error("Error fetching contacts:", error);
    return;
  }

  console.log(`Found ${contacts.length} contacts named 'Hostnin'.`);

  for (const contact of contacts) {
    const phone = contact.phone;
    if (!phone) {
      console.log(`Contact ${contact.id} has no phone. Skipping.`);
      continue;
    }

    console.log(`\nLooking up ${phone} (${contact.platform_id}) in WHMCS...`);
    try {
      // Clean phone number (extract digits)
      const digits = phone.replace(/\D/g, '');
      const whmcsRes = await whmcsRequest('GetClientByPhone', { phone: digits });
      
      let realName = null;
      let realEmail = null;

      if (whmcsRes && whmcsRes.clients && whmcsRes.clients.length > 0) {
        // Find best match or use first one
        const client = whmcsRes.clients[0];
        realName = `${client.firstname} ${client.lastname}`.trim();
        realEmail = client.email;
        console.log(`  -> Found in WHMCS: "${realName}" (${realEmail})`);
      } else {
        // Fallback: search by GetClients
        console.log(`  -> Not found in GetClientByPhone. Trying search with GetClients...`);
        const searchRes = await whmcsRequest('GetClients', { search: digits });
        if (searchRes && searchRes.clients && searchRes.clients.client && searchRes.clients.client.length > 0) {
          const client = searchRes.clients.client[0];
          realName = `${client.firstname} ${client.lastname}`.trim();
          realEmail = client.email;
          console.log(`  -> Found via GetClients search: "${realName}" (${realEmail})`);
        }
      }

      if (realName) {
        console.log(`  -> Updating contact ${contact.id} name to "${realName}" and email to "${realEmail}"...`);
        const { error: updateErr } = await supabase
          .from('contacts')
          .update({ name: realName, email: realEmail || contact.email })
          .eq('id', contact.id);

        if (updateErr) {
          console.error(`  -> Failed to update contact ${contact.id}:`, updateErr);
        } else {
          console.log(`  -> Successfully updated contact ${contact.id}!`);
        }
      } else {
        console.log(`  -> WHMCS returned no results for ${phone}. Updating contact name to phone number to clear 'Hostnin'...`);
        const fallbackName = `+${phone}`;
        const { error: updateErr } = await supabase
          .from('contacts')
          .update({ name: fallbackName })
          .eq('id', contact.id);
        
        if (updateErr) {
          console.error(`  -> Failed to update contact ${contact.id} to fallback:`, updateErr);
        } else {
          console.log(`  -> Successfully updated contact ${contact.id} to fallback!`);
        }
      }
    } catch (e) {
      console.error(`  -> Error processing ${phone}:`, e.message);
    }
  }
  console.log("\nCleanup run complete!");
}

run();
