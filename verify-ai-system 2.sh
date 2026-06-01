#!/bin/bash
# TalkFuze AI System - 1 Hour Verification Script
# Run this 1 hour after deployment to verify everything is working
# Usage: bash verify-ai-system.sh

echo "============================================"
echo "TalkFuze AI System - 1 Hour Health Check"
echo "Time: $(date)"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /Users/imran/Documents/Talkfuze

echo "1. AUTO-RESOLVE: Did conversations get auto-resolved?"
echo "---"
npx supabase db query "
SELECT 
  COUNT(*) FILTER (WHERE status = 'open') as still_open,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
  COUNT(*) FILTER (WHERE status = 'closed') as closed
FROM conversations 
WHERE created_at > now() - interval '24 hours';
" --linked 2>&1 | grep -A20 '"rows"'
echo ""

echo "2. CONVERSATION LEARNING: Are conversations being tagged as ai_learned?"
echo "---"
npx supabase db query "
SELECT 
  COUNT(*) FILTER (WHERE tags @> ARRAY['ai_learned']::text[]) as learned,
  COUNT(*) FILTER (WHERE NOT (tags @> ARRAY['ai_learned']::text[]) OR tags IS NULL) as not_yet,
  COUNT(*) as total
FROM conversations 
WHERE created_at > now() - interval '7 days';
" --linked 2>&1 | grep -A10 '"rows"'
echo ""

echo "3. RESOLUTION PATTERNS: Any new patterns in the knowledge base?"
echo "---"
npx supabase db query "
SELECT 
  COUNT(*) as total_rules,
  COUNT(*) FILTER (WHERE answer LIKE '%RESOLUTION PATTERN%') as resolution_patterns,
  COUNT(*) FILTER (WHERE answer LIKE '%CRITICAL RULE%') as edit_rules,
  MAX(created_at) as newest_rule
FROM ai_knowledge_base WHERE is_active = true;
" --linked 2>&1 | grep -A10 '"rows"'
echo ""

echo "4. AI DRAFT ACTIVITY: Are drafts being generated?"
echo "---"
npx supabase db query "
SELECT 
  COUNT(*) as total_drafts_today,
  COUNT(*) FILTER (WHERE was_edited = false AND agent_sent IS NOT NULL) as approved_as_is,
  COUNT(*) FILTER (WHERE was_edited = true) as edited,
  ROUND(100.0 * COUNT(*) FILTER (WHERE was_edited = false AND agent_sent IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as approval_pct
FROM ai_draft_logs
WHERE created_at > now() - interval '2 hours';
" --linked 2>&1 | grep -A10 '"rows"'
echo ""

echo "5. LATEST LEARNED PATTERNS (if any):"
echo "---"
npx supabase db query "
SELECT 
  question,
  LEFT(rule_short, 80) as workflow,
  created_at
FROM ai_knowledge_base 
WHERE answer LIKE '%RESOLUTION PATTERN%'
ORDER BY created_at DESC LIMIT 3;
" --linked 2>&1 | grep -A30 '"rows"'
echo ""

echo "============================================"
echo "Verification complete. Review results above."
echo "============================================"
