<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:talkfuze-workflow-rules -->
# Workspace & Workflow Access Rules
- I have Supabase access: I can do everything from Supabase by myself and do not need to ask Imran to manually check or do anything.
- I have all access to Vercel and GitHub as well. I will not be dumb and let Imran pass my work. I will verify things myself.

# Deployment & Worker Access
- **Frontend**: The TalkFuze frontend is deployed on Vercel. After modifying local frontend code, I MUST automatically commit and push to GitHub (`git add . && git commit -m "..." && git push`) so Vercel auto-deploys it.
- **WhatsApp Worker**: The TalkFuze-WhatsApp-Worker is NOT on Vercel or GitHub. It runs persistently via PM2 on the `strack` VPS.
- **Worker Deployment**: Whenever I modify the local worker files (e.g. `index.js`, `queue.js`), I MUST autonomously deploy them using `scp` to `strack:/root/Talkfuze-WhatsApp-Worker/` and restart the worker using `ssh strack "pm2 restart talkfuze-wa-worker"`. I will NOT ask Imran to do this manually.
<!-- END:talkfuze-workflow-rules -->
