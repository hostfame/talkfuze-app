# TalkFuze AI - Autonomous Support Intelligence

> Central alignment document for all agents, tools, and collaborators.
> Read this file before making any AI-related changes to TalkFuze.

---

## What Is This Project?

TalkFuze is Hostnin's customer support chat platform. It handles ~75-100 conversations per day across WhatsApp, Messenger, Instagram, and web widget channels.

The **AI system inside TalkFuze** is what this document covers. It drafts replies for support agents, learns from their edits, and is being built toward full autonomy - where the AI can handle most customer conversations without human intervention.

---

## The Problem We Are Solving

Support agents spend 8-10 hours/day answering repetitive questions. The same types of issues (nameservers, site down, SSL, billing) come up every day. An AI system that learns from how agents handle these conversations can gradually take over routine work, freeing agents for complex cases.

**The previous attempt (Nina AI) failed** because of "prompt bloat" - rules kept growing inside the system prompt until the AI degraded, then rules were deleted, and all learning was lost. This cycle repeated.

**Our solution**: Store all learning in a vector database, not in the prompt. The AI retrieves only the 6 most relevant rules per request. Whether we have 100 or 100,000 rules, the prompt stays the same size. Learning is additive and permanent.

---

## Current Architecture

```
Customer sends message
       |
       v
AI Draft Route (/api/ai/draft)
       |
       +-- Detects intent (sales vs support)
       +-- Retrieves 6 relevant rules from vector DB (904+ rules)
       +-- Injects workflow (sales funnel OR support triage)
       +-- Gets dynamic golden examples (recent approved drafts)
       +-- Generates draft via DeepSeek (primary) or OpenAI (fallback)
       |
       v
Agent reviews draft
       |
       +-- Sends as-is → "approved" → becomes future golden example
       +-- Edits then sends → Sonnet analyzes diff → extracts rule → stores in vector DB
       |
       v
Conversation completes (30min idle = auto-resolved)
       |
       v
Layer 3: Sonnet analyzes full conversation → extracts resolution pattern → stores in vector DB
```

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/ai/draft/route.ts` | Main AI drafting endpoint. Builds system prompt, retrieves rules, streams response |
| `src/actions/ai-learning.ts` | Learning pipeline. Edit extraction (Layer 2), conversation learning (Layer 3), golden examples |
| `src/data/support-triage.ts` | Layer 1: Coded support workflow (ask domain, collect details, offer ticket) |
| `src/data/sales-funnel.ts` | Sales diagnostic funnel (4-step flow for pricing conversations) |
| `src/actions/knowledge-engine.ts` | Static knowledge retrieval (pricing, policies, tech specs) |
| `src/app/api/ai/learn-conversations/route.ts` | Cron endpoint: auto-resolves idle conversations, runs conversation learning |
| `src/actions/dashboard.ts` | Triggers conversation learning on resolve/close/archive |
| `vercel.json` | Cron schedule: learning runs every 30 minutes |

### Database Tables

| Table | Purpose |
|-------|---------|
| `ai_knowledge_base` | Vector store for all learned rules and resolution patterns |
| `ai_draft_logs` | Logs every AI draft: what AI generated, what agent sent, was it edited |
| `conversations` | Chat threads. `tags` array includes `ai_learned` for processed ones |
| `messages` | Individual messages in conversations |

---

## The 3-Layer Learning System

### Layer 1: Support Triage Workflow (Coded, zero cost)
A hard-coded workflow that tells the AI how to handle support conversations. Like a training manual for a new employee. It covers 12 issue types (site down, nameserver, SSL, email, domain, WordPress, cPanel, billing, etc.) and tells the AI exactly what info to collect for each type and when to offer ticket conversion.

**Status: BUILT and DEPLOYED**

### Layer 2: Edit-Based Learning (Per edit, ~$0.01)
When an agent edits an AI draft before sending, Sonnet analyzes the difference and extracts a compact rule. This rule is stored in the vector database with an embedding, so similar future conversations retrieve it automatically.

**Status: WORKING (existed before this project)**

### Layer 3: Conversation Completion Learning (Per conversation, ~$0.009)
When a conversation is idle for 1+ hour (or manually resolved/archived), Sonnet analyzes the FULL conversation and extracts a "resolution pattern": issue type, info collected, resolution method, agent workflow, and the best agent reply. This teaches the AI complete workflows, not just single-turn corrections.

Quality gates:
- Score < 3 (out of 5) = skipped (bad agent replies not learned)
- Greeting-only conversations = skipped
- Deduplication: 0.88 vector similarity threshold

**Status: BUILT and DEPLOYED**

### Dynamic Golden Examples (Zero cost)
Recent AI drafts that agents approved without editing are used as tone calibration. Instead of static example replies, the AI sees real, recent, approved replies as "this is what correct looks like."

**Status: BUILT and DEPLOYED**

### Auto-Resolve (Zero cost)
Conversations idle for 30+ minutes are automatically marked as "resolved". This feeds the learning pipeline and keeps the inbox clean.

**Status: BUILT and DEPLOYED**

---

## The 3-Phase Roadmap

### Phase 1: Improve Drafting Accuracy (CURRENT - started May 30, 2026)

**Goal**: AI drafts are correct and natural. Agents click "send" without editing 70-80% of the time.

**Current metric**: ~32% approval rate (68% of drafts are edited before sending)

**How we get there**:
- Support triage workflow guides AI through the right process
- Edit-based learning corrects factual and tone errors
- Conversation completion learning teaches full workflows
- Dynamic golden examples calibrate tone from real approved drafts

**Target timeline**: 2-3 months to reach 70-80% approval

**Exit criteria**: Approval rate consistently above 75% for 2 consecutive weeks

### Phase 2: Automatic Replies (After Phase 1 exit criteria met)

**Goal**: AI sends replies automatically for routine cases. Agents monitor but don't pre-approve.

**What needs to be built (NOT built yet)**:
- Confidence scoring per draft (AI rates its own certainty)
- Auto-send for high confidence (>85%) on known issue types
- Category-based rules: greetings = auto, sales = human review, technical = depends on confidence
- Audit log: every auto-sent message tracked for post-review
- Kill switch: agent can disable auto-send per conversation or globally

**Target**: 30-50% of conversations handled autonomously

### Phase 3: Agentic Tool Access (After Phase 2 is stable)

**Goal**: AI can take real actions - update nameservers, check server status, edit invoices, create tickets in WHMCS.

**What needs to be built (NOT built yet)**:
- Tool framework (function calling with WHMCS API, cPanel, DNS)
- Permission system (what the AI can and cannot do)
- Action logging and rollback capability
- Human approval required for destructive actions (invoice edits, account changes, password resets)

**Target**: 60-75% of support cases resolved end-to-end by AI

---

## Cost Structure

| Component | Cost | When |
|-----------|------|------|
| Layer 2 (edit learning) | ~$0.01 per edited draft | Every agent edit |
| Layer 3 (conversation learning) | ~$0.009 per conversation | Every resolved conversation |
| Vector embeddings (OpenAI) | ~$0.10/month | Continuous |
| Draft generation (DeepSeek) | Already paid | Every draft request |
| **Total monthly estimate** | **$15-35/month** | Based on ~2,500 conversations/month |

---

## Measurement & Monitoring

### Weekly Check (Every Monday)
```sql
-- Approval rate (what % of AI drafts agents send without editing)
SELECT 
  DATE(created_at) as day,
  COUNT(*) as total_drafts,
  COUNT(*) FILTER (WHERE was_edited = false AND agent_sent IS NOT NULL) as approved,
  ROUND(100.0 * COUNT(*) FILTER (WHERE was_edited = false AND agent_sent IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as approval_pct
FROM ai_draft_logs
WHERE created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;
```

### Resolution Patterns Accumulated
```sql
-- How many resolution patterns the AI has learned
SELECT 
  COUNT(*) as total_patterns,
  COUNT(*) FILTER (WHERE answer LIKE '%RESOLUTION PATTERN%') as resolution_patterns,
  COUNT(*) FILTER (WHERE answer LIKE '%CRITICAL RULE%') as edit_rules,
  COUNT(*) FILTER (WHERE answer LIKE '%MANUAL TEACHING%') as manual_rules
FROM ai_knowledge_base WHERE is_active = true;
```

### Conversation Learning Health
```sql
-- Is the cron processing conversations?
SELECT 
  COUNT(*) FILTER (WHERE tags @> ARRAY['ai_learned']::text[]) as learned,
  COUNT(*) FILTER (WHERE NOT (tags @> ARRAY['ai_learned']::text[]) OR tags IS NULL) as pending,
  COUNT(*) as total
FROM conversations 
WHERE created_at > now() - interval '7 days';
```

---

## Rules for Any Agent Working on This

1. **NEVER add rules to the system prompt.** All learning goes into `ai_knowledge_base` via vector embeddings. The prompt stays fixed.
2. **NEVER delete learned rules.** Set `is_active = false` if a rule is wrong. Deleting loses the embedding.
3. **The prompt size must stay constant.** If you're adding text to `buildSystemPrompt()`, you're doing it wrong. Use the knowledge engine or vector DB instead.
4. **Test with both Bengali and English.** 80% of conversations are in Bengali. The AI must handle Bangla, Banglish, and English.
5. **Sales funnel and support triage are mutually exclusive.** If sales intent is detected, sales funnel activates. If support intent (and no sales), support triage activates. Never both.
6. **DeepSeek is the primary model for drafting.** OpenAI gpt-4o-mini is the fallback. Sonnet (Claude) is only used for learning analysis, never for drafting.
7. **The cron runs every 30 minutes.** It auto-resolves idle conversations (30min) and processes them for learning (1hr).
8. **Do not change the 3-phase roadmap** without Imran's explicit approval. Phase 2 and 3 features should NOT be built until Phase 1 exit criteria are met.

---

## What Has Been Completed (as of May 30, 2026)

- [x] Support triage workflow (Layer 1) - `support-triage.ts`
- [x] Conversation completion learning (Layer 3) - `learnFromResolvedConversation()`
- [x] Batch processor for idle conversations - `processIdleConversationsForLearning()`
- [x] Cron endpoint with auto-resolve - `/api/ai/learn-conversations`
- [x] Dynamic golden examples wired into draft route
- [x] Triggers on resolve, close, archive in `dashboard.ts`
- [x] Vercel cron configured (every 30 minutes)
- [x] Auto-resolve idle conversations after 30 minutes
- [x] Deduplication guards (prevent double-processing)
- [x] Quality gates (skip low-quality and greeting-only conversations)

## What Is NOT Built Yet

- [ ] Confidence scoring for auto-send (Phase 2)
- [ ] Auto-send mechanism (Phase 2)
- [ ] Tool framework for agentic actions (Phase 3)
- [ ] WHMCS/cPanel tool integrations (Phase 3)
- [ ] Stage-aware rule filtering (Layer 2 enhancement)
- [ ] Old rule format upgrade script (65 legacy rules)

---

*Last updated: May 30, 2026*
*Maintained by: Imran + AI agents*
*Location: /Users/imran/Documents/Talkfuze/AI_PROJECT.md*
