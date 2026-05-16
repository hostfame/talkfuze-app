const { createClient } = require('@supabase/supabase-js');
const supabase = createClient("https://fyuymnldgvfvdqcnbsxh.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A", {
  auth: { persistSession: false }
});
async function run() {
  const { data, error } = await supabase.from('channels').select('*');
  console.log(JSON.stringify(data, null, 2));
}
run();
