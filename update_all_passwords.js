require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  process.exit(1);
}

// Pass ws transport to avoid Node.js 20 WebSocket constructor issues in Supabase SDK
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws
  }
});

const teamUpdates = {
  'rafy@hostnin.com': 'Rafy@Fuze!895',
  'asad@hostnin.com': 'Asad#Secure%731',
  'mujahid@hostnin.com': 'Mujahid&Talk*456',
  'mahfuz@hostnin.com': 'Mahfuz^Gate$293',
  'aisha@hostnin.com': 'Aisha*Cloud#612'
};

async function updateTeamPasswords() {
  console.log('Fetching users from Supabase Auth...');
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }

  for (const [email, newPassword] of Object.entries(teamUpdates)) {
    const user = users.find(u => u.email === email);
    if (!user) {
      console.warn(`User with email ${email} not found in Supabase Auth.`);
      continue;
    }

    console.log(`Updating password for ${email} (ID: ${user.id})...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error(`Failed to update password for ${email}:`, updateError.message);
    } else {
      console.log(`Successfully updated password for ${email}!`);
    }
  }
  console.log('Password update process complete.');
}

updateTeamPasswords();
