import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching last 1000 messages to calculate gaps...");
  const { data, error } = await supabase
    .from('messages')
    .select('created_at, content')
    // AI is used on customer messages mainly, but any AI draft resets the cache.
    // Wait, AI only runs when the draft button is pressed, not on every message!
    // But let's assume the question is "how often do ANY messages come in?"
    // If the team isn't using AI reply first, then the AI endpoint ISN'T being hit!
    .order('created_at', { ascending: false })
    .limit(1000);
    
  if (error) {
    console.error(error);
    process.exit(1);
  }
  
  let cacheHits = 0;
  let cacheMisses = 0;
  let maxGap = 0;
  
  for (let i = 0; i < data.length - 1; i++) {
    const newer = new Date(data[i].created_at).getTime();
    const older = new Date(data[i+1].created_at).getTime();
    
    const diffMins = (newer - older) / (1000 * 60);
    
    if (diffMins > maxGap) maxGap = diffMins;
    
    if (diffMins <= 5) {
      cacheHits++;
    } else {
      cacheMisses++;
    }
  }
  
  const totalGaps = cacheHits + cacheMisses;
  console.log(`\n--- MESSAGE GAP ANALYSIS (Last 1000 messages) ---`);
  console.log(`Cache retained (gap <= 5 mins): ${cacheHits} times`);
  console.log(`Cache dropped (gap > 5 mins): ${cacheMisses} times`);
  console.log(`Estimated Cache Hit Rate: ${((cacheHits / totalGaps) * 100).toFixed(2)}%`);
  console.log(`Maximum idle gap: ${maxGap.toFixed(2)} minutes`);
  
  process.exit(0);
}

run();
