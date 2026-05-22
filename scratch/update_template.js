
require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await sb.from('whatsapp_templates')
    .update({ template: "Hi {firstname}, great news! Your service for '{domain}' is now active and ready.\n\nLogin details have been emailed to you. Reach out if you need help getting started!" })
    .eq('name', 'AfterModuleCreate');
  if (error) console.error(error);
  else console.log('Updated successfully');
}
run();
