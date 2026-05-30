---
name: talkfuze-realtime-state
description: "Use when working with optimistic UI, Zustand state management, and Supabase Realtime message syncing in TalkFuze. Triggers: sending messages, message status (sending/sent/failed), chat thread UI updates, conversation lists, or resolving race conditions between UI and DB."
metadata:
  author: imran
  version: "1.0.0"
---

# TalkFuze Realtime & State Management Standards

## 1. Optimistic UI Architecture
TalkFuze uses an optimistic UI model for extreme speed. When a user or agent sends a message:
- **Instant UI Update:** The message is instantly injected into the Zustand store (`useMessageStore`) with a temporary ID (`temp-xxxx`) and `status: 'sending'`.
- **Metadata Parity:** Ensure ALL necessary UI metadata (like `ai_draft_original`, `used_ai_draft`, `scheduled_delay`) is attached to the optimistic message. If you miss a field here, the UI will break or show fallbacks until the server confirms the message.
- **Background Execution:** The actual DB insert and external API calls (e.g., WhatsApp/Meta) happen asynchronously.
- **Server Confirmation:** The UI listens to Supabase Realtime. When the actual message arrives from the DB, the optimistic message is replaced by the real message (via `markConfirmed` or direct substitution).

## 2. Zustand Store Patterns
- **Do not fetch directly in components:** Components should subscribe to the Zustand store. Fetching data in `useEffect` and storing in local component state causes flicker and race conditions.
- **Handling Temp IDs:** When matching DB messages with optimistic messages, always rely on `metadata->>'temp_id'`.

## 3. Debounce & Timers
- **AI Draft Logging:** Do not log AI drafts immediately on every keystroke. We use an 8000ms debounce timer to wait for the user to finish editing before flushing the `ai_draft_logs`.
- **Timer Cleanup:** Always ensure `clearTimeout` is called when components unmount or dependencies change to prevent memory leaks and ghost executions.

## 4. LocalStorage as Fallback
- For transient states that must survive page reloads (e.g., active AI draft text before it is sent), use `localStorage` alongside component state. 
- Always clean up `localStorage` keys immediately after the action completes (e.g., after the message is sent).

## 5. Supabase RPC & Realtime Performance
- **Event Storms:** Realtime listeners (e.g., `postgres_changes` on `conversations` or `messages`) can fire hundreds of times a minute. Code inside these listeners MUST be extremely fast. Do not run heavy RPCs or refetch the entire DB unnecessarily on every broadcast.
- **RPC Slowness Bug:** Never use `auth.uid()` inside an `INNER JOIN` in a Supabase RPC. The PostgreSQL query planner treats it as volatile and may execute a full table scan or nested loop, turning a 1ms query into a 1000ms query.
- **The Fix:** For `SECURITY DEFINER` functions, write them in `plpgsql`, fetch the user's `org_id` ONCE at the start using `SELECT org_id INTO v_org_id FROM users WHERE id = auth.uid() LIMIT 1;`, and then use `v_org_id` in the main query.
