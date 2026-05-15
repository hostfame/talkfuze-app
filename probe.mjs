import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const regions = [
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-northeast-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com'
];

async function run() {
  for (const host of regions) {
    const connectionString = `postgresql://postgres.fyuymnldgvfvdqcnbsxh:aUwIC0tlsD7zbea%40%23@${host}:6543/postgres`;
    const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      console.log(`Success connecting to ${host}`);
      const sql = fs.readFileSync('./supabase/migrations/00_init.sql', 'utf8');
      await client.query(sql);
      console.log('Migration applied successfully!');
      await client.end();
      return;
    } catch (e) {
      console.log(`Failed on ${host}: ${e.message}`);
    }
  }
}
run();
