const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

const envLocal = dotenv.parse(fs.readFileSync('.env.local'));
// Extract connection string from SUPABASE_URL? Wait, .env.local doesn't have postgres URL.
