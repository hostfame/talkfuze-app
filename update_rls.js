const { Client } = require('pg');

const client = new Client({
  connectionString: "postgresql://postgres:aUwIC0tlsD7zbea%40%23@db.fyuymnldgvfvdqcnbsxh.supabase.co:5432/postgres"
});

async function run() {
  await client.connect();
  
  // Allow anonymous selection of messages and conversations for Realtime MVP
  await client.query(`
    DROP POLICY IF EXISTS "Widget anonymous read" ON public.messages;
    CREATE POLICY "Widget anonymous read" ON public.messages FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Widget anonymous read" ON public.conversations;
    CREATE POLICY "Widget anonymous read" ON public.conversations FOR SELECT USING (true);
  `);
  
  console.log("RLS policies updated for Realtime MVP");
  await client.end();
}

run().catch(console.error);
