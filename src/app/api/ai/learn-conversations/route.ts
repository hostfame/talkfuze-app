import { NextResponse } from "next/server";
import { processIdleConversationsForLearning } from "@/actions/ai-learning";

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * Conversation Learning Cron Endpoint
 * 
 * Processes idle conversations (1+ hour inactive) to extract resolution patterns.
 * Called by Vercel Cron every 30 minutes, or manually via query param.
 * 
 * GET /api/ai/learn-conversations
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel cron sends Authorization: Bearer <CRON_SECRET>)
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    // Also allow query param for manual testing
    const { searchParams } = new URL(request.url);
    if (searchParams.get('secret') !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processIdleConversationsForLearning();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error("[learn-conversations] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
