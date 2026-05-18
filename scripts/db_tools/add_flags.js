const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.fyuymnldgvfvdqcnbsxh:aUwIC0tlsD7zbea%40%23@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
});
async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");
  
  await client.query(`
    ALTER TABLE public.conversations 
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_unread BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false;
  `);
  console.log("Added is_pinned, is_unread, is_muted to conversations table.");
  
  await client.end();
}
run().catch(console.error);
