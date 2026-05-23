require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

async function run() {
  console.log("Starting DB pruning and training sanitization...");

  // 1. Surgical deletion of the identified garbage ID
  const garbageId = 'f11000b8-e0ec-4d09-a06f-fd77ac4dc260';
  const { error: surgicalError } = await supabase
    .from('ai_knowledge_base')
    .delete()
    .eq('id', garbageId);

  if (surgicalError) {
    console.error(`Surgical deletion failed for ${garbageId}:`, surgicalError);
  } else {
    console.log(`Surgically pruned known garbage item: ${garbageId} ✅`);
  }

  // 2. Fetch all entries to do pattern scanning for garbage whispers
  const { data: entries, error: fetchError } = await supabase
    .from('ai_knowledge_base')
    .select('id, question, answer');

  if (fetchError) {
    console.error("Failed to fetch knowledge base:", fetchError);
    return;
  }

  const badKeywords = [
    'reply hocche na', 
    'hocche na', 
    'reply hocchena', 
    'রিপ্লাই হচ্ছে না', 
    'ভাইয়া এআই', 
    'bhaia ai', 
    'bhaiya ai', 
    'ai reply', 
    'ভাইয়া এআই'
  ];

  const idsToDelete = [];
  for (const entry of entries) {
    const textToScan = `${entry.question} ${entry.answer}`.toLowerCase();
    if (badKeywords.some(kw => textToScan.includes(kw))) {
      console.log(`Found garbage entry to delete: ID: ${entry.id} | Q: "${entry.question}" | A: "${entry.answer}"`);
      idsToDelete.push(entry.id);
    }
  }

  if (idsToDelete.length > 0) {
    console.log(`Deleting ${idsToDelete.length} matching garbage training items...`);
    const { error: deleteError } = await supabase
      .from('ai_knowledge_base')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      console.error("Failed to execute bulk garbage pruning:", deleteError);
    } else {
      console.log("Successfully sanitized database of all internal note leaks! ✅");
    }
  } else {
    console.log("No other garbage patterns found in the database. Clean sweep complete! ✨");
  }
}
run();
