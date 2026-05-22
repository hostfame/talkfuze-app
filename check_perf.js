const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.fyuymnldgvfvdqcnbsxh:fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
});
async function run() {
  await client.connect();
  
  const resPolicies = await client.query(`
    SELECT pol.polname, pol.polcmd, pol.polqual 
    FROM pg_policy pol 
    JOIN pg_class tbl ON pol.polrelid = tbl.oid 
    WHERE tbl.relname = 'messages';
  `);
  console.log("Policies:", resPolicies.rows);

  const resIndexes = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'messages';
  `);
  console.log("Indexes:", resIndexes.rows);

  await client.end();
}
run().catch(console.error);
