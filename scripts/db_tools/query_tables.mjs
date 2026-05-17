import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://postgres:aUwIC0tlsD7zbea%40%23@db.fyuymnldgvfvdqcnbsxh.supabase.co:5432/postgres' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
