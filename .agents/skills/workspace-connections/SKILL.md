---
name: workspace-connections
description: "Use to understand your permissions, access rights, and deployment capabilities across Supabase, Vercel, GitHub, and VPS. Triggers: when deploying, running SQL, checking database, querying data, checking vercel, managing workers, or needing access to infrastructure."
metadata:
  author: imran
  version: "1.0.0"
---

# Workspace Connections & Access Rules

## 1. Supabase Access
- **You have direct Supabase access.** You can do everything from Supabase by yourself and do not need to ask Imran to manually check or run anything.
- **ALWAYS use CLI for Supabase SQL operations** (e.g., `npx supabase db query --linked "SELECT ..."`). 
- NEVER ask Imran to open the browser or run SQL manually. You have full access to query the database, check tables, and verify data directly via CLI.

## 2. Vercel & GitHub Deployment
- **Frontend Deployment**: The TalkFuze frontend is deployed on Vercel. After modifying local frontend code, you MUST automatically commit and push to GitHub (`git add . && git commit -m "..." && git push`) so Vercel auto-deploys it.
- **Full Access**: You have all access to Vercel and GitHub as well. Do not be dumb and let Imran verify your work. Verify things yourself.

## 3. VPS & Worker Deployment
- **WhatsApp Worker**: The TalkFuze-WhatsApp-Worker is NOT on Vercel or GitHub. It runs persistently via PM2 on the `strack` VPS.
- **Worker Deployment**: Whenever you modify the local worker files (e.g., `index.js`, `queue.js`), you MUST autonomously deploy them using `scp` to `strack:/root/Talkfuze-WhatsApp-Worker/` and restart the worker using `ssh strack "pm2 restart talkfuze-wa-worker"`. 
- NEVER ask Imran to do this manually.
