import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

// Create a single supabase client for interacting with your database in the browser
// This automatically reads the authentication cookie set by Next.js
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
