---
name: fix-talkfuze-ai
description: "Use when fixing, debugging, or improving TalkFuze AI draft quality. Triggers: AI draft issues, bad AI replies, AI tone problems, AI language mismatch, learning pipeline, knowledge base rules, prompt engineering, AI system improvements, vector search tuning, golden examples, rule extraction."
metadata:
  author: imran
  version: "2.0.0"
  last_updated: "2026-05-29"
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
| `src/data/bangla-style.ts` | Bengali voice/tone style guide. Pattern-based, not word lists. | WHEN tone direction changes |
| `ai_knowledge_base` (Supabase) | Learned rules + verified replies. | FREQUENTLY - this is where fixes go |

---

## 2. THE TOP 10 EVALUATION FRAMEWORK (For Logic & Feature Updates)

When Imran asks to fix a logical flaw, add a new feature (e.g., Nameserver extraction), or change the AI's core behavior, **you MUST follow this framework before writing any code**:

1. **Do not immediately implement the first thought or the easiest fix.**
2. **Brainstorm the Top 10 (or top 5-20) approaches** to solve the problem.
3. **Evaluate each approach** against these enterprise-grade criteria:
   - **Latency:** Does it slow down the chat? (0ms added is the goal).
   - **Accuracy/Consistency:** Does it solve the issue 100% of the time, or does it leave edge cases?
   - **Prompt Bloat:** Does it add unnecessary tokens to the system prompt?
   - **Scalability:** Can other team members understand and manage it?
4. **Present the Analysis:** Write a clean, structured artifact detailing the approaches, highlighting the pros and cons of each.
5. **Select the Best:** Explicitly recommend the most effective, enterprise-grade approach with the most pros and fewest cons, even if it takes more engineering effort. Wait for Imran's approval before executing.

---

## 3. THE FIX WORKFLOW (How to Fix Bad Drafts)

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

### The Core Principle: AI-Native Solutions Only

Before implementing ANY fix, ask: **"Would OpenAI, Anthropic, or DeepMind solve this with a word list, a regex, or a dictionary?"** If the answer is no, neither should we.

Modern LLMs learn from **patterns, examples, and context** - not from ban lists and word filters. The correct approach is always:
1. **Describe the desired voice/tone** (pattern-level guidance)
2. **Show 3-5 golden examples** of correct output (few-shot learning)
3. **Let the LLM generalize** from examples to all cases

This is how fine-tuning, RLHF, and system prompting work at scale. A ban list is the opposite - it's a brittle, finite, pre-AI approach that fails the moment the model finds a synonym.

### Pre-AI Methods (NEVER Use These)

| Problem | Wrong Approach (Pre-AI) | Right Approach (AI-Native) |
|---------|------------------------|---------------------------|
| Wrong Bengali word choice | Ban list: "Never use দর্শক, use ভিজিটর" | Style description: "Write like a modern tech startup" + 5 examples of correct tone |
| Robotic phrasing | Regex post-processing to swap words | Golden examples showing natural phrasing |
| Wrong plan recommendation | System prompt rule: "Never recommend X for Y" | Vector-matched rule in ai_knowledge_base |
| Tone too formal | Dictionary mapping: formal → casual | Voice description in bangla-style.ts: "25-year-old Dhaka tech pro on WhatsApp" |
| Language bleeding | Word-level filtering per language | Structural isolation: conditional prompt assembly + sanitization layers |
| Repeated questions | State machine tracking asked questions | Conversation history context + "NEVER repeat" instruction |

### Specific Anti-Patterns:

1. **NEVER add situational rules to the system prompt.**
   System prompt is for personality, format, and universal behavior.
   Situational rules (plan recommendations, product edge cases) go in `ai_knowledge_base` with vector embeddings.

2. **NEVER use regex, word filters, or dictionary lookups for style/tone.**
   Regex is for structural tasks only: language script detection (Unicode ranges), tag parsing, plan name extraction.
   Regex is NEVER for: tone, style, word choice, formality level. The LLM uses synonyms that bypass any filter.

3. **NEVER dump large static data into the prompt.**
   The 470KB JSON knowledge dump was removed for a reason. ~117K tokens wasted.
   Use: knowledge-engine.ts for dynamic, intent-based knowledge injection.

4. **NEVER build post-processing to auto-replace words.**
   Bengali grammar is positional. Regex replacement breaks sentence structure.
   The LLM understands context - guide it with examples, not find-and-replace.

5. **NEVER build growing ban/rejection lists.**
   Bengali has 100K+ words. You ban "দর্শক", AI uses "পরিদর্শক". Ban that, AI uses "প্রেক্ষক". This is infinite whack-a-mole and creates prompt bloat, inconsistency, and maintenance burden.
   Instead: Describe the VOICE ("modern startup Bengali"), show 5 golden examples, let the LLM generalize the pattern to ALL words - including words you never thought to ban.

6. **NEVER build a funnel state machine with regex.**
   The LLM is better at understanding ambiguous customer answers than any regex.

7. **NEVER make two changes simultaneously.**
   If you change the prompt AND the retrieval logic and output gets worse, you can't tell which caused it. One change, test, then next.

### The Litmus Test

If you're about to:
- Add a new word to a "banned" or "rejected" list → **STOP**. Add a golden example instead.
- Write a regex to detect a style problem → **STOP**. Write a tone description instead.
- Build a mapping of "word X → word Y" → **STOP**. The LLM will bypass it with synonyms.
- Create a post-processing filter → **STOP**. Fix the prompt that generates bad output upstream.

The only exception: `stripBengaliLines()` for language isolation. This is structural (Unicode range check), not semantic. It gates an entire language, not individual words.

---

## 3.5. LANGUAGE ISOLATION ARCHITECTURE (How Language Consistency Works)

The AI serves both Bengali and English customers. Language bleeding (Bengali text in English conversations or vice versa) is prevented by a 3-layer architecture:

### Layer 1: Language Detection
`detectConversationLanguage()` in `route.ts` determines the conversation language:
- Bengali script detected → Bengali
- Banglish words detected → Bengali  
- Ambiguous short message → check last 3 customer messages for Bengali
- Everything else → English

### Layer 2: Conditional Prompt Assembly
Every section of the prompt is language-gated:
- `buildSystemPrompt(language)` → language-specific examples, escalation, rules
- `getGlobalBrain(language)` → Bengali tone rules only for Bengali
- `getSalesFunnelContent(language)` → language-appropriate funnel examples
- `getLearningData(orgId, language)` → only same-language golden examples and rules
- `banglaStyleContent` → injected ONLY for Bengali conversations

### Layer 3: Nuclear Sanitization
A final defensive layer `stripBengaliLines()` removes any line containing Bengali Unicode from ALL dynamic content (knowledge context, semantic rules, few-shot blocks) when the detected language is English. This catches any Bengali that leaks through from:
- Vector DB results (golden examples, knowledge docs)
- Canned responses
- Learned rules from ai_knowledge_base

### Layer 4: Hard Language Override
For English conversations, a `CRITICAL LANGUAGE OVERRIDE` instruction is appended to the user message. This prevents the LLM from inferring Bengali based on contextual cues (e.g., customer says "BD" meaning Bangladesh, LLM interprets this as a Bengali language request).

**When to modify language isolation:**
- New dynamic content sources added → ensure they pass through `stripBengaliLines` for English
- New prompt sections added → ensure they use the language parameter from `detectedLanguage`
- NEVER add Bengali examples to language-neutral sections of the prompt

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

**2026-05-29: Language Isolation Architecture**
- Problem: Bengali text leaked into English conversations from 8+ sources (static prompt sections, vector DB golden examples, learned rules, canned responses, hardcoded examples, and LLM contextual inference)
- Root cause: DeepSeek model inferred Bengali from "BD" (Bangladesh) context even with a clean English prompt
- Solution: 4-layer defense: conditional prompt assembly, language-aware DB queries, nuclear Bengali strip for English, and hard language override instruction
- Key insight: Removing Bengali from the prompt was necessary but insufficient. The model needs EXPLICIT language enforcement instructions at the end of the user message.
- Rule: Any new dynamic content source MUST pass through `stripBengaliLines()` for English conversations. Any new prompt section MUST use `detectedLanguage` for conditional assembly.

**2026-05-29: Bengali Style - Pattern Over Rejection**
- Rewrote `bangla-style.ts` from mixed approach (some examples + some word bans) to pure pattern-based style guide
- Principle: Describe the VOICE ("modern Bangladeshi tech startup"), give EXAMPLES of correct tone, let the LLM generalize
- Anti-pattern identified: Word-by-word rejection lists ("use X not Y") are infinite whack-a-mole. Bengali has 100K+ words. The LLM finds synonyms the ban list never covers.
- Rule: Style fixes go through golden examples and tone descriptions, NEVER through word ban lists.

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
