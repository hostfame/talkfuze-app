import { createClient } from '@supabase/supabase-js';

// Use the service role key to bypass RLS for server-side actions like
// processing incoming widget messages from anonymous users.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);
