require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
supabase.auth.signInWithPassword({
  email: 'agent@hostnin.com',
  password: 'password123'
}).then(res => console.log('Anon Key Test:', res.error ? res.error.message : 'Success'));

const supabaseAdmin = createClient(supabaseUrl, serviceKey);
supabaseAdmin.from('users').select('id').limit(1).then(res => console.log('Service Key Test:', res.error ? res.error.message : 'Success'));
