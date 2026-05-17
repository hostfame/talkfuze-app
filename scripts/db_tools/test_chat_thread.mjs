import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTc1MDYsImV4cCI6MjA5NDM5MzUwNn0.V_N5h1uE4wQcQ1oY-0l9hJqH0Z8W2nK3XyYvD3B0Rqw"; 
const supabaseAdmin = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } });

async function run() {
  const { data, error } = await supabaseAdmin.from('messages')
    .select('id, content_type, metadata')
    .eq('content_type', 'video')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log("Recent videos:", JSON.stringify(data, null, 2));
}

run();
