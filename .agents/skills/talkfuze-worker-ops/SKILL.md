---
name: talkfuze-worker-ops
description: "Use when debugging, deploying, or modifying the TalkFuze external API worker that handles WhatsApp and Meta webhooks. Triggers: WhatsApp API failures, Meta Graph API issues, webhook payload routing, PM2 worker restarts, or VPS background jobs."
metadata:
  author: imran
  version: "1.0.0"
---

# TalkFuze Worker Ops & Webhook Standards

## 1. Architecture
- **Separation of Concerns:** TalkFuze runs a dedicated Node.js worker on the `strack` VPS to handle heavy, high-volume inbound webhook traffic from Meta (WhatsApp, Messenger, Instagram). 
- **Bypassing Vercel:** We do NOT route raw Meta webhooks through Vercel serverless functions because of cold start timeouts and connection limits during high traffic spikes.
- **Data Flow:** Meta -> Strack VPS Worker -> Supabase DB -> Realtime Sync to Vercel Frontend.

## 2. Deployment Protocol
- **DO NOT push worker code to Vercel.** 
- When you modify the local worker files (e.g., `index.js`, `queue.js`), you MUST autonomously deploy them via SSH/SCP.
- **Command:** `scp path/to/local/file strack:/root/Talkfuze-WhatsApp-Worker/`
- **Restart:** `ssh strack "pm2 restart talkfuze-wa-worker"`
- NEVER ask Imran to deploy the worker manually. Do it yourself and verify it is running via `ssh strack "pm2 logs talkfuze-wa-worker --lines 20"`.

## 3. Meta Graph API & WhatsApp Payloads
- **Payload Nuances:** Meta webhooks are nested. Always check for `entry[0].changes[0].value.messages[0]` before assuming a message exists.
- **Stateless Verification:** The worker must always respond with `HTTP 200 OK` to Meta immediately to prevent Meta from retrying and causing duplicate messages in our database. Processing should happen asynchronously.
- **Error Handling:** If the worker crashes, PM2 will restart it. However, unhandled promise rejections during DB inserts must be caught and logged so we do not lose inbound customer messages.

## 4. Race Conditions (Database Inserts)
- **High-Volume Concurrency:** When a new customer sends multiple messages in the same millisecond, both payloads may simultaneously check if the contact exists, find nothing, and attempt to `insert()`. 
- **The Bug:** The second `insert()` will fail due to a unique constraint violation (`platform_id`). If you use `.select('id').single()`, it returns `{ data: null, error }`, which crashes the worker if you blindly access `.id`.
- **The Fix:** ALWAYS handle `insert()` errors or null returns when creating contacts/conversations/channels. Use `.maybeSingle()` instead of `.single()`, catch the error, and re-query the database to fetch the ID that the competing thread just inserted.

## 5. Webhook Payload Safety
- **Defensive Parsing:** Evolution API and Meta webhooks frequently omit fields or change schemas (e.g., missing `timestamp` on calls, or arrays instead of objects). 
- **The Fix:** Never blindly parse timestamps or IDs. Always use fallbacks: `const ts = payload.timestamp ? Number(payload.timestamp) : (Date.now() / 1000);`. Failure to do this causes `Invalid time value` errors which crash async workers silently.
