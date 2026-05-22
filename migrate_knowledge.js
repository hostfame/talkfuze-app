const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // We don't have a table yet. Let's execute SQL via RPC or just tell the user I'll create it via SQL.
  // Actually, I can use the existing REST API to check if ai_knowledge_base exists
  const { data, error } = await supabase.from('ai_knowledge_base').select('id').limit(1);
  console.log('Check table:', error ? error.message : 'Table exists');
}
run();
