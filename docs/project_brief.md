# TalkFuze - Project Brief & Discovery Q&A

> **Created:** May 15, 2026
> **Last Updated:** May 15, 2026
> **Status:** Planning - Awaiting Approval

---

## Vision Statement

Build an Intercom Fin competitor - omnichannel AI chat platform. Multi-tenant SaaS. AI-driven with human handoff. Starting with BD e-commerce, scaling globally.

---

## Business Model

| Item | Detail |
|------|--------|
| Brand | TalkFuze |
| Revenue Model | Per chat - ৳1/chat (adjustable later, may become per-seat for big businesses) |
| First Client | E-commerce business, paying ১ lakh BDT for the solution |
| Target Market | BD e-commerce first, then global |
| Competitive Edge | All-in-one, AI-driven, affordable |
| Open Source | No - closed source. May have a free plan later |

---

## Full Discovery Q&A (74 Questions)

### A. Vision & Business Model

| # | Question | Answer |
|---|----------|--------|
| 1 | Who's the customer? | First: external e-commerce client (paying ১ lakh). Then Hostnin internal. Then sell to all. Base is same for everyone. |
| 2 | Revenue model? | Per chat ৳1. Can change later - per conversation, per seat for big businesses. |
| 3 | Brand name? | TalkFuze (confirmed) |
| 4 | Pricing range? | Flat per chat ৳1 for now (API cost on top) |
| 5 | Target market? | BD e-commerce first, then global. Goal: take over Fin one day. |
| 6 | Competitive positioning? | All-in-one |
| 7 | Keeping AnyChat running? | Yes, running alongside. Migrate when TalkFuze is validated for client business. |
| 8 | Multi-tenant? | Yes, from start |

### B. Channels

| # | Question | Answer |
|---|----------|--------|
| 9 | Facebook Messenger API? | Whichever API connects easily to send/receive (Meta Graph API Pages Messaging) |
| 10 | FB Page comments? | Both monitor + AI reply. Skip if needs separate complex API from messaging. |
| 11 | Instagram? | DMs + comments. Skip comments if too complex / separate API. |
| 12 | TikTok? | Messaging. Add more capability later. |
| 13 | Website widget? | Yes, Intercom bubble style |
| 14 | WhatsApp? | Whichever API connects easily (Meta WhatsApp Business API) |
| 15 | Email? | Optional for now, add later |
| 16 | SMS? | Not for now |
| 17 | Telegram? | Not for now |
| 18 | MVP channel priority? | Messenger AND Website Widget. Start with the hard one. |

### C. AI System

| # | Question | Answer |
|---|----------|--------|
| 19 | AI model? | OpenAI (GPT-4o) |
| 20 | Knowledge base input? | All methods: upload docs, connect website, FAQ editor |
| 21 | Product catalog? | Yes, starting with WooCommerce |
| 22 | Order/delivery status? | WooCommerce for now. Shopify and others later. |
| 23 | Image analysis? | Yes, maybe Gemini for vision. Budget for API calls. |
| 24 | AI confidence threshold? | Yes, configurable per client in AI chat settings |
| 25 | AI training/behavior? | Yes, clients can customize AI behavior |
| 26 | AI languages? | Auto-detect. Mostly Bangla in BD. Fine-tune for conversational tone, not typical AI writing. |
| 27 | AI memory? | Yes, remembers previous conversations with same customer |
| 28 | Canned responses? | Both: AI suggests + human approves, AND fully autonomous mode |

### D. Human Handoff

| # | Question | Answer |
|---|----------|--------|
| 29 | Handoff triggers? | All of them (keyword, sentiment, customer request, AI uncertainty). Based on user configuration. |
| 30 | Handoff flow? | Both: explicit ("let me connect you") AND silent transfer. Configurable. |
| 31 | Agent assignment? | Configurable in settings (round-robin, skill-based, manual) |
| 32 | Agent availability? | Configurable in settings (online/offline/busy) |
| 33 | Queue management? | Configurable in settings |
| 34 | Escalation? | Yes, configurable in settings |

### E. Dashboard & UX

| # | Question | Answer |
|---|----------|--------|
| 35 | Real-time? | Yes, real-time. Less delay = better. |
| 36 | Conversation threading? | Separate per channel (hard to know same customer across platforms) |
| 37 | Customer profile sidebar? | Yes, like Intercom's right panel |
| 38 | Internal notes? | Yes |
| 39 | Keyboard shortcuts? | Yes, needed |
| 40 | Mobile app? | Both web + mobile |
| 41 | Dark mode? | Yes |
| 42 | Notifications? | All: browser push, sound, desktop |

### F. FB Page Comment Management

| # | Question | Answer |
|---|----------|--------|
| 43 | Auto-reply to comments? | Yes, configurable in user settings |
| 44 | Hide/delete negative? | Yes, if Facebook allows. User sets tags/words to filter. |
| 45 | Comment-to-DM conversion? | Yes, if Facebook allows |
| 46 | Multiple pages? | Yes, one client can connect multiple FB pages |
| 47 | Ad comments? | Skip for now, add to queue |

### G. Technical Architecture

| # | Question | Answer |
|---|----------|--------|
| 48 | Hosting? | Own VPS available, but start with Vercel for now |
| 49 | Database? | Supabase (concern: can it throttle/delay for realtime?) |
| 50 | Framework? | Next.js preferred. Open to better options if easier to run. |
| 51 | Message queue? | No preference - recommend best for the need |
| 52 | WebSocket provider? | No preference - recommend best |
| 53 | File storage? | No preference - recommend best |
| 54 | Auth system? | No preference - recommend best |
| 55 | Rate limiting? | Per client (or both per client + per API key) |
| 56 | Webhook handling? | No preference - recommend best |

### H. Data & Integrations

| # | Question | Answer |
|---|----------|--------|
| 57 | WHMCS integration? | Yes, for Hostnin use + selling to other hosting companies |
| 58 | WooCommerce/Shopify? | WooCommerce is must-have |
| 59 | CRM/lead capture? | Yes, basic lead capture + contact storage essential for MVP |
| 60 | Analytics/reporting? | Yes - response time, resolution rate, everything |
| 61 | Export? | Yes, clients can export chat history |

### I. Scale & Performance

| # | Question | Answer |
|---|----------|--------|
| 62 | Expected volume? | Up to 3,000 messages/day for first 3 months |
| 63 | Message retention? | Forever. Delete later if storage costs too high. |
| 64 | Concurrent connections? | No preference - recommend best |

### J. Security & Compliance

| # | Question | Answer |
|---|----------|--------|
| 65 | Data isolation? | No preference - recommend best |
| 66 | GDPR? | Yes, needed for global launch |
| 67 | Encryption? | No preference - recommend best |
| 68 | API key management? | Add later |

### K. Go-to-Market

| # | Question | Answer |
|---|----------|--------|
| 69 | Timeline? | ASAP (this week if possible) |
| 70 | First customer? | External e-commerce client (ready to pay ১ lakh) |
| 71 | Hours/week dedicated? | Full day, can work simultaneously |
| 72 | API budget? | ৳5,000 BDT max/mo. Can get from client if needed. |
| 73 | Team? | Imran + AI agents (no human devs) |
| 74 | Open source? | Closed source. May have free plan. |

---

## Tech Stack Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | Next.js 15 (App Router) | Imran knows it, fast to ship |
| Database | Supabase (Postgres + Realtime) | Built-in RLS, Realtime, Auth |
| Real-time | Supabase Realtime (Broadcast) | No separate WebSocket server |
| Message Queue | BullMQ + Redis | Background AI processing, webhooks |
| File Storage | Supabase Storage | S3-compatible, RLS-protected |
| Auth | Supabase Auth | Built-in, multi-tenant via org claims |
| Hosting | Vercel (frontend) + VPS (workers) | Vercel for Next.js, VPS for BullMQ/Redis |
| AI Text | OpenAI GPT-4o | Best conversational AI |
| AI Vision | Gemini 2.0 Flash | Cheaper for image analysis |
| Rate Limiting | Upstash Redis | Per-tenant + per-API key |
| Data Isolation | Shared schema + RLS | Standard multi-tenant pattern |
| Encryption | TLS in transit + AES-256 at rest | GDPR-ready |

---

## MVP Scope (What Ships First)

### Must Have (Phase 1 MVP)
- [x] Multi-tenant foundation + auth
- [ ] Agent dashboard (3-panel inbox like Intercom)
- [ ] Website chat widget (embeddable JS)
- [ ] Facebook Messenger integration
- [ ] AI engine (GPT-4o + Gemini vision)
- [ ] WooCommerce integration (product + order lookup)
- [ ] Human handoff system
- [ ] Basic analytics

### Phase 2 (After MVP Validated)
- [ ] Instagram DMs
- [ ] FB Page comments management
- [ ] WHMCS integration
- [ ] Email channel
- [ ] CRM module
- [ ] Ad comments management

### Phase 3 (Scale)
- [ ] TikTok DMs
- [ ] WhatsApp
- [ ] Mobile app (React Native)
- [ ] Advanced CRM
- [ ] Shopify integration

---

## Cost Structure

| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro | $25 (~৳3,000) |
| Vercel Pro | $20 (~৳2,400) |
| OpenAI API | ~$30-50 (~৳3,600-6,000) |
| Gemini API | ~$5-10 (~৳600-1,200) |
| Redis (Upstash) | Free / $10 |
| **Total** | **~$80-115/mo (~৳9,600-13,800)** |

**Revenue at 3K msgs/day:** ৳90,000/mo
**Margin:** ~৳76,000-80,000/mo (healthy)

---

## Key Constraints & Reminders

1. **Meta App Review** takes 3-7 days - submit EARLY
2. **FB Comments = separate API** from Messenger (different permissions)
3. **TikTok API** has regional restrictions in BD
4. **24-hour messaging window** on Messenger/Instagram - can't message after 24h
5. **Supabase Pro** needed for 500 concurrent connections
6. **OpenAI costs scale** with message length - monitor closely
7. **AnyChat stays running** until TalkFuze is validated

---

*This document is the single source of truth for TalkFuze project decisions.*
