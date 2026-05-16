const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:aUwIC0tlsD7zbea%40%23@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");
  
  // Add status column to messages
  await client.query("ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';");
  console.log("Added status column to messages.");
  
  await client.end();
}
run().catch(console.error);
