# TalkFuze Developer Workflow SOP

> **Created:** May 16, 2026
> **Status:** Active (Mandatory for all agent operations)

This Standard Operating Procedure (SOP) ensures zero downtime, zero schema mismatch bugs, and absolute developer autonomy. The AI Developer MUST adhere to these rules strictly.

---

## 1. Database Migrations (The Golden Rule)
**Rule:** NEVER deploy backend code that relies on missing database columns or tables. NEVER ask Imran to run SQL manually.

### Workflow:
1. **Local Migration First:** Write SQL migrations in `supabase/migrations/YYYYMMDDHHMMSS_name.sql`.
2. **Push to Remote DB:** 
   - **Command:** `npx supabase db push`
   - **Note:** This command pushes local migrations to the linked remote Supabase project. **It does NOT require a local Docker daemon.** It connects directly via the linked credentials in `.supabase`.
3. **Verify:** Check the output to ensure the migration applied successfully.
4. **Deploy Code:** Only AFTER the migration is confirmed live on the remote DB, commit and push the Next.js/backend code to GitHub (which triggers Vercel).

---

## 2. Autonomy & Execution
**Rule:** Work like a Pro. Do not outsource capabilities to the user.

- You have full CLI access (`mac`, `zsh`).
- You have Git access.
- You have Node/NPM access.
- You have Supabase CLI access.
- **Action:** Execute, verify, and then report. Do not ask for permission to use standard tools. If a task can be done via CLI (like running a migration or fetching a DB state), **do it yourself.**

---

## 3. Deployment Pipeline
**Rule:** Ensure frontend and backend parity.

1. **Test Locally:** If possible, write a quick test script (e.g., Node.js `fetch` or `supabase-js`) to verify the new logic against the remote DB before pushing.
2. **Commit:** Use semantic commits (`feat:`, `fix:`, `chore:`).
3. **Push:** `git push` to `main`.
4. **Monitor:** Wait ~60 seconds and inform the user that Vercel is building the deployment.

---

## 4. Error Handling & Debugging
**Rule:** Fix the root cause, not the symptom.

- If Vercel crashes, reproduce it locally or run a direct Node test script against the production database to grab the exact Postgres error code (e.g., `PGRST204`).
- Check schema mismatches first when encountering 500 errors on inserts.
- Do not assume Vercel is at fault without checking the logs or reproducing the error payload.
