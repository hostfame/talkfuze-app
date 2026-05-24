const pg = require('pg');
const { Client } = pg;

const connectionString = 'postgresql://postgres:aUwIC0tlsD7zbea%40%23@db.fyuymnldgvfvdqcnbsxh.supabase.co:5432/postgres';

async function run() {
  console.log("Attempting direct connection to Supabase direct host (5432)...");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  const start = Date.now();
  try {
    await client.connect();
    console.log("Connected!");
    const res = await client.query('SELECT 1 as result');
    const end = Date.now();
    console.log(`✅ Success! Query latency: ${end - start}ms, result:`, res.rows);
    await client.end();
  } catch (e) {
    console.log(`❌ Connection Failed: ${e.message}`);
  }
}
run();
