import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import WebSocket from 'ws';

// @ts-ignore
global.WebSocket = WebSocket;

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixUsers() {
  const { data: users, error } = await supabaseAdmin.from('users').select('id, org_id');
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`Found ${users.length} users. Fixing app_metadata...`);
  
  for (const user of users) {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { org_id: user.org_id }
    });
    if (authError) {
      console.error(`Failed for ${user.id}:`, authError.message);
    } else {
      console.log(`Updated user ${user.id} with org_id ${user.org_id}`);
    }
  }
  
  console.log('Done!');
}

fixUsers();
