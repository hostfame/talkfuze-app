const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: contacts, error: contactError } = await supabase
    .from('contacts')
    .select('id, metadata')
    .not('metadata->whatsapp_invalid', 'is', null);
    
  if (contactError) {
    console.error('Contact Error:', contactError);
    return;
  }
  
  const toFix = contacts.filter(c => c.metadata?.whatsapp_invalid === true);
  console.log(`Found ${toFix.length} contacts marked as invalid`);
  
  let fixedCount = 0;
  for (const contact of toFix) {
    const updatedMeta = { ...contact.metadata };
    delete updatedMeta.whatsapp_invalid;
    
    const { error: updateErr } = await supabase
      .from('contacts')
      .update({ metadata: updatedMeta })
      .eq('id', contact.id);
      
    if (updateErr) {
      console.error(`Failed to update ${contact.id}:`, updateErr);
    } else {
      fixedCount++;
    }
  }
  
  console.log(`Fixed ${fixedCount} contacts`);
}

run();
