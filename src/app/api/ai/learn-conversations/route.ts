import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { processIdleConversationsForLearning } from "@/actions/ai-learning";

/**
 * Conversation Lifecycle Cron Endpoint
 * Runs every 30 minutes. Two jobs:
 * 
 * 1. Auto-resolve: Mark conversations as 'resolved' after 30min inactivity
 * 2. Learn: Extract resolution patterns from conversations idle for 1+ hour
 * 
 * GET /api/ai/learn-conversations
 */
export async function GET(request: Request) {
  // Auth: accept Vercel cron header, CRON_SECRET bearer, or query param
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  
  // Vercel Pro cron sends this header automatically
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  
  if (!isVercelCron) {
    // Not from Vercel cron - check manual auth
    if (cronSecret) {
      // CRON_SECRET is set - require it
      const hasValidBearer = authHeader === `Bearer ${cronSecret}`;
      const hasValidParam = searchParams.get('secret') === cronSecret;
      if (!hasValidBearer && !hasValidParam) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    // If cronSecret is empty/undefined, allow unauthenticated access (dev mode)
  }

  const results: { autoResolved: number; learned: number; errors: number } = {
    autoResolved: 0,
    learned: 0,
    errors: 0
  };

  try {
    // Step 1: Auto-resolve conversations idle for 30+ minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: idleConversations, error: resolveError } = await supabaseAdmin
      .from('conversations')
      .update({ status: 'resolved' })
      .eq('status', 'open')
      .lt('last_message_at', thirtyMinAgo)
      .select('id');

    if (resolveError) {
      console.error("[AutoResolve] Error:", resolveError);
    } else {
      results.autoResolved = idleConversations?.length || 0;
      if (results.autoResolved > 0) {
        console.log(`[AutoResolve] Resolved ${results.autoResolved} idle conversations`);
      }
    }

    // Step 2: Learn from conversations idle for 1+ hour
    const learnResult = await processIdleConversationsForLearning();
    results.learned = learnResult.processed;
    results.errors = learnResult.errors;

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error("[learn-conversations] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
