require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// We need an auth token to simulate client. 
// Without a real user token, we can't test RLS properly.
console.log("We need a user token to test client RLS.");
