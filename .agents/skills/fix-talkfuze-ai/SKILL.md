---
name: fix-talkfuze-ai
description: "Use when fixing, debugging, or improving TalkFuze AI draft quality. Triggers: AI draft issues, bad AI replies, AI tone problems, AI language mismatch, learning pipeline, knowledge base rules, prompt engineering, AI system improvements, vector search tuning, golden examples, rule extraction."
metadata:
  author: imran
  version: "1.0.0"
  last_updated: "2026-05-27"
---

# Fix TalkFuze AI - Master Reference

> **Read this ENTIRE file before making ANY changes to the AI system.**
> This file exists because the previous approach of ad-hoc fixes caused prompt bloat (200 -> 800 tokens) and repeated mistakes. Every fix must follow the principles below.

---

## 1. SYSTEM ARCHITECTURE (How It Works)

The TalkFuze AI draft system has these layers:

```
┌─────────────────────────────────────────────┐
│ SYSTEM PROMPT (~600 tokens, FROZEN)         │
│ Identity + Format + Language + Style +      │
│ Escalation + Sales Funnel + Bengali Vocab   │
│ *** DO NOT ADD RULES HERE ***               │
├─────────────────────────────────────────────┤
│ DYNAMIC CONTEXT (loaded per request)        │
│ - 6 learned rules from vector search        │
│ - 2 golden examples (verified replies)      │
│ - Knowledge engine (pricing, policies)      │
│ - CRM data (customer services, invoices)    │
│ - Conversation history (last 20 messages)   │
├─────────────────────────────────────────────┤
│ LEARNING PIPELINE (automatic)               │
│ Agent edits draft -> Sonnet analyzes ->     │
│ 30-word rule + verified reply stored ->     │
│ Vector embedded -> Retrieved next time      │
└─────────────────────────────────────────────┘
```

### Key Files

| File | Purpose | Edit Frequency |
|------|---------|---------------|
| `src/app/api/ai/draft/route.ts` | Main draft API. System prompt, retrieval, streaming. | RARE - only for systemic issues |
| `src/actions/ai-learning.ts` | Learning pipeline. Sonnet extraction, vector storage. | RARE - only if extraction format changes |
| `src/actions/ai.ts` | Server-action draft generation (validation). | RARE - keep aligned with route.ts |
| `src/actions/knowledge-engine.ts` | Static knowledge builder (pricing, policies). | WHEN pricing/policies change |
| `src/data/sales-funnel.ts` | Sales diagnostic flow (4-step funnel). | WHEN funnel logic changes |
| `src/data/bangla-style.ts` | Bengali vocabulary and style rules. | WHEN new vocab standards needed |
| `ai_knowledge_base` (Supabase) | Learned rules + verified replies. | FREQUENTLY - this is where fixes go |

---

## 2. THE FIX WORKFLOW (How to Fix Bad Drafts)

When Imran reports a bad AI draft, follow this decision tree:

```
Bad draft reported
│
├── Step 1: DIAGNOSE the category
│   ├── TONE issue (bookish, robotic, cheerleader)
│   ├── LANGUAGE issue (wrong language, Banglish output)
│   ├── FACTUAL issue (wrong plan, wrong price, hallucination)
│   ├── FUNNEL issue (skipped steps, premature recommendation)
│   ├── CONTEXT issue (repeated info, ignored history)
│   └── VERBOSITY issue (too long, bullet lists, filler)
│
├── Step 2: CHECK if learning pipeline already caught it
│   Run: SELECT rule_short, verified_reply_text 
│        FROM ai_knowledge_base 
│        WHERE question ILIKE '%<topic>%' 
│        ORDER BY created_at DESC LIMIT 5;
│
│   ├── Rule EXISTS but AI still fails
│   │   └── RETRIEVAL problem. Fix the rule's question/embedding
│   │       so vector search matches it to the right context.
│   │       Do NOT add to system prompt.
│   │
│   └── Rule DOES NOT exist
│       └── INSERT into ai_knowledge_base with:
│           - question: 1-sentence customer context
│           - answer: full [CRITICAL RULE] + [STYLE CORRECTION] + [VERIFIED REPLY]
│           - rule_short: max 30 words, actionable "Do X / Never do Y"
│           - verified_reply_text: the correct agent reply
│           - Generate embedding via OpenAI text-embedding-3-small
│           Do NOT add to system prompt.
│
├── Step 3: Is this SYSTEMIC? (Happens in ALL chats, not just similar ones)
│   ├── NO (situational) → Database fix only. DONE.
│   └── YES (systemic) → This is the ONLY case where prompt changes are allowed.
│       Examples of systemic issues:
│       - Language tag format broken (streaming breaks)
│       - Greeting detection logic wrong
│       - Format output structure changed
│       NON-examples (these are NOT systemic):
│       - "AI recommended wrong plan for e-commerce" → database rule
│       - "AI used bookish word X" → database rule or vocab list
│       - "AI repeated the greeting" → database rule
│
└── Step 4: VERIFY the fix
    - Check the rule was inserted: SELECT * FROM ai_knowledge_base WHERE created_at > now() - interval '1 hour';
    - Test retrieval: generate embedding for a test query and run match_knowledge
    - Do NOT deploy prompt changes without build verification
```

---

## 3. ANTI-PATTERNS (What NOT to Do)

### Never Do These:

1. **NEVER add situational rules to the system prompt.**
   Bad: Adding "Never recommend Turbo for showcase sites" to route.ts
   Good: Insert it as a rule in ai_knowledge_base with proper embedding

2. **NEVER use regex for tone, style, or semantic checks.**
   Regex catches exact words only. The AI will use synonyms. Whack-a-mole forever.
   Use: Golden examples (show correct behavior) or database rules (vector-matched)

3. **NEVER build post-processing to auto-replace words.**
   Bengali grammar is positional. Regex replacement breaks sentence structure.
   Use: Vocabulary list in bangla-style.ts (show correct words TO USE, not what to ban)

4. **NEVER dump large static data into the prompt.**
   The 470KB JSON knowledge dump was removed for a reason. ~117K tokens wasted.
   Use: knowledge-engine.ts for dynamic, intent-based knowledge injection

5. **NEVER create banned word lists.**
   You block "সম্পূর্ণভাবে", AI uses "সম্পূর্ণরূপে". You block that, AI uses "সামগ্রিকভাবে".
   Use: Approved vocabulary in bangla-style.ts. Tell AI what TO use, not what NOT to use.

6. **NEVER build a funnel state machine with regex.**
   Regex is dumber than the LLM at understanding ambiguous customer answers.
   The sales funnel prompt (restructured into clean steps) handles this. 88.6% accuracy is sufficient.

7. **NEVER make two changes simultaneously.**
   If you change the prompt AND the retrieval logic, and output gets worse, you cannot tell which caused it. One change at a time. Test. Then next change.

---

## 4. ARCHITECTURE DECISIONS (Why We Built It This Way)

### Decision Log (Date each entry so stale advice can be identified)

**2026-05-27: Prompt Restructuring**
- Old: One wall of text with vague instructions like "Apple-style minimalism"
- New: Clean sections (IDENTITY, FORMAT, LANGUAGE, STYLE, ESCALATION)
- Why: LLM attends to structured sections better than prose paragraphs
- Rule: The system prompt should stay at ~600 tokens. If it grows past 800, something is wrong.

**2026-05-27: Learning Extraction Format**
- Old: Sonnet produced 2,559-char analysis blobs stored as one field
- New: Sonnet produces rule_short (30 words) + verified_reply_text (exact reply) in separate columns
- Why: 3 old rules = 1,920 tokens of noise. 6 new rules = 282 tokens of clear instructions.
- Rule: If avg rule_short length exceeds 200 chars, the extraction prompt needs tightening.

**2026-05-27: Retrieval Tuning**
- Old: match_count=3, match_threshold=0.45
- New: match_count=6, match_threshold=0.50
- Why: More rules with less noise. Higher threshold filters irrelevant matches.
- Rule: If AI is missing relevant rules, lower threshold to 0.45. If getting noisy irrelevant rules, raise to 0.55.

**2026-05-27: Golden Examples**
- Verified agent replies injected as few-shot examples from vector search results
- Max 2 per request to avoid bloat
- Why: Showing correct behavior is 10x more effective than describing it

**2026-05-27: Regex Rejection**
- Regex is ONLY used for: Bengali script detection (unicode ranges), language tag parsing, plan name detection
- Regex is NEVER used for: tone detection, style enforcement, word banning, funnel state tracking
- Why: Regex matches exact strings. Tone/style are semantic. Use the LLM or vector search instead.

**2026-05-27: 470KB JSON Removal**
- Removed JSON.stringify(knowledge) from ai.ts
- Knowledge is now served by knowledge-engine.ts (intent-based, ~2KB per request vs 470KB)
- Rule: NEVER inject the full knowledge JSON again. If a knowledge gap is found, add it to knowledge-engine.ts sections.

---

## 5. DIAGNOSTIC QUERIES (Quick Health Checks)

Run these via `npx supabase db query --linked` when debugging:

### Check rule counts and quality
```sql
SELECT 
  COUNT(*) as total_rules,
  COUNT(CASE WHEN rule_short IS NOT NULL THEN 1 END) as has_short_rule,
  COUNT(CASE WHEN verified_reply_text IS NOT NULL THEN 1 END) as has_verified_reply,
  ROUND(AVG(CASE WHEN rule_short IS NOT NULL THEN length(rule_short) END)) as avg_rule_len
FROM ai_knowledge_base WHERE is_active = true;
```

### Check recent draft approval rate
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN was_edited = false THEN 1 END) as approved,
  ROUND(100.0 * COUNT(CASE WHEN was_edited = false THEN 1 END) / COUNT(*), 1) as approval_pct
FROM ai_draft_logs 
WHERE created_at > now() - interval '7 days';
```

### Check what errors are most common this week
```sql
SELECT 
  ROUND(100.0 * COUNT(CASE WHEN correction_feedback ILIKE '%tone%' OR correction_feedback ILIKE '%robotic%' OR correction_feedback ILIKE '%formal%' THEN 1 END) / COUNT(*), 1) as tone_pct,
  ROUND(100.0 * COUNT(CASE WHEN correction_feedback ILIKE '%verbose%' OR correction_feedback ILIKE '%too long%' THEN 1 END) / COUNT(*), 1) as verbose_pct,
  ROUND(100.0 * COUNT(CASE WHEN correction_feedback ILIKE '%language%mismatch%' THEN 1 END) / COUNT(*), 1) as lang_pct,
  COUNT(*) as total_edited
FROM ai_draft_logs
WHERE was_edited = true AND correction_feedback IS NOT NULL
  AND created_at > now() - interval '7 days';
```

### Search for an existing rule on a topic
```sql
SELECT rule_short, LEFT(verified_reply_text, 150), created_at
FROM ai_knowledge_base
WHERE question ILIKE '%<TOPIC>%' AND is_active = true
ORDER BY created_at DESC LIMIT 5;
```

---

## 6. HOW TO INSERT A MANUAL FIX (Step-by-Step)

When the learning pipeline did not catch an issue and you need to manually add a rule:

```sql
-- Step 1: Insert the rule
INSERT INTO ai_knowledge_base (question, answer, rule_short, verified_reply_text)
VALUES (
  'Customer context: <1-sentence description of the situation>',
  '[CRITICAL RULE]: <Detailed explanation of what went wrong and why>
[STYLE CORRECTION]: <What was changed and why>

[VERIFIED REPLY]: <The exact correct reply>',
  '<Max 30-word actionable instruction>',
  '<The exact correct reply text>'
);

-- Step 2: Generate and store the embedding
-- This must be done via application code or API call to OpenAI
-- The learning pipeline handles this automatically for agent edits
-- For manual inserts, use the embedding generation endpoint or script
```

---

## 7. GOALS AND TARGETS

| Metric | Current (May 2026) | Target | Notes |
|--------|-------------------|--------|-------|
| Draft approval rate | ~45-55% | 75%+ | Track weekly via diagnostic query |
| System prompt size | ~600 tokens | < 800 tokens | If exceeding, rules are leaking into prompt |
| Avg rule_short length | 187 chars | < 100 chars | Tighten extraction prompt if growing |
| Rules loaded per request | 6 | 6-8 | Increase only if approval rate plateaus |
| Golden examples per request | 2 | 2-3 | Increase only with proven impact |
| Tone errors (%) | 55% of edits | < 20% | Primary focus area |
| Verbosity errors (%) | 39.5% of edits | < 15% | Second focus area |

---

## 8. WHEN TO UPDATE THIS FILE

Update this skill file ONLY when:
- A new architectural decision is made (add to Decision Log with date)
- A new anti-pattern is discovered (add to Anti-Patterns)
- Retrieval parameters are tuned (update current values)
- Goals/targets change based on data

Do NOT update for:
- Individual rule fixes (those go in the database)
- Specific customer complaints (those go in the database)
- Temporary debugging (use scratch files instead)
