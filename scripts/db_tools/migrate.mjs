import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:aUwIC0tlsD7zbea%40%23@db.fyuymnldgvfvdqcnbsxh.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to Supabase DB');
    
    const sql = fs.readFileSync('./supabase/migrations/00_init.sql', 'utf8');
    
    await client.query(sql);
    console.log('Migration executed successfully');
  } catch (err) {
    console.error('Error executing migration', err);
  } finally {
    await client.end();
  }
}

runMigration();
