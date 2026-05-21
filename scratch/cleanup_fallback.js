require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('name', 'Hostnin')
    .eq('platform_type', 'whatsapp');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Remaining contacts named 'Hostnin': ${contacts.length}`);

  for (const contact of contacts) {
    const fallbackName = `+${contact.phone}`;
    console.log(`Setting contact ${contact.id} to fallback name ${fallbackName}`);
    await supabase
      .from('contacts')
      .update({ name: fallbackName })
      .eq('id', contact.id);
  }
  console.log("Fallback naming complete.");
}
run();
