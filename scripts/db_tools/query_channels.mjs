import { Client } from 'pg';
const client = new Client({ connectionString: 'postgresql://postgres.fyuymnldgvfvdqcnbsxh:fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A@aws-0-ap-south-1.pooler.supabase.com:6543/postgres' });
async function run() {
  await client.connect();
  const res = await client.query('SELECT type, config FROM public.channels;');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
