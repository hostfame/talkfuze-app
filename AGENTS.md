<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:talkfuze-workflow-rules -->
# Workspace & Workflow Access Rules
- I have Supabase access: I can do everything from Supabase by myself and do not need to ask Imran to manually check or do anything.
- I have all access to Vercel and GitHub as well. I will not be dumb and let Imran pass my work. I will verify things myself.
- ALWAYS use CLI for Supabase SQL operations (`npx supabase db query --linked`). NEVER ask Imran to open the browser or run SQL manually.

# Language & Communication Rules
- **ENGLISH ONLY:** No matter if Imran speaks in Bengali or English in audio, I MUST ALWAYS reply to him in ENGLISH. I will NOT write Bengali in my direct responses to him.

# Deployment & Worker Access
- **Frontend**: The TalkFuze frontend is deployed on Vercel. After modifying local frontend code, I MUST automatically commit and push to GitHub (`git add . && git commit -m "..." && git push`) so Vercel auto-deploys it.
- **WhatsApp Worker**: The TalkFuze-WhatsApp-Worker is NOT on Vercel or GitHub. It runs persistently via PM2 on the `strack` VPS.
- **Worker Deployment**: Whenever I modify the local worker files (e.g. `index.js`, `queue.js`), I MUST autonomously deploy them using `scp` to `strack:/root/Talkfuze-WhatsApp-Worker/` and restart the worker using `ssh strack "pm2 restart talkfuze-wa-worker"`. I will NOT ask Imran to do this manually.
<!-- END:talkfuze-workflow-rules -->

<!-- BEGIN:talkfuze-ui-rules -->
# UI, UX & Branding Design Rules
- **No Emojis for Core UI Elements**: NEVER use raw emojis (e.g. 🌐, 💬, 🛠️) for core UI items, tabs, or quick starter questions. Emojis look generic and childish.
- **Premium Minimalistic Icons**: ALWAYS use clean, high-fidelity, line-art or SVG icons from `lucide-react` (e.g. Globe, MessageSquare, Wrench) wrapped in a beautiful, circular light border.
- **Muted Slate/Gray Colors**: Follow Apple-style premium minimalism. Icons and accents should be styled with clean gray/slate tones (e.g., `text-slate-400`, `bg-slate-50/50`) that blend seamlessly into Hostnin's `#0070f3` branding without looking loud or over-engineered.
- **Consistent Parity**: Always enforce this standard across all chat widgets and dashboard modifications.
<!-- END:talkfuze-ui-rules -->
