const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.fyuymnldgvfvdqcnbsxh:fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
});
async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");
  
  // Enable realtime for channels
  await client.query('alter publication supabase_realtime add table public.channels;');
  console.log("Enabled realtime for channels.");
  
  // Disable RLS for channels so frontend can read it without auth
  await client.query('ALTER TABLE public.channels DISABLE ROW LEVEL SECURITY;');
  console.log("Disabled RLS on channels.");
  
  await client.end();
}
run().catch(console.error);
