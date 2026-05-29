---
name: talkfuze-ui-ux
description: "Use when modifying or creating Frontend UI elements, React components, dashboards, or Chat widgets. Triggers: Tailwind CSS changes, adding icons, styling text, designing layouts, or adding animations."
metadata:
  author: imran
  version: "1.0.0"
---

# TalkFuze UI, UX & Branding Design Rules

## 1. No Emojis for Core UI Elements
- **NEVER** use raw emojis (e.g. 🌐, 💬, 🛠️) for core UI items, tabs, menus, or quick starter questions.
- Emojis look generic and childish in enterprise software.

## 2. Premium Minimalistic Icons
- **ALWAYS** use clean, high-fidelity, line-art or SVG icons from `lucide-react` (e.g., `<Globe />`, `<MessageSquare />`, `<Wrench />`).
- If an icon needs emphasis, wrap it in a beautiful, circular light border with a subtle background (e.g., `p-1.5 rounded-full border bg-slate-50`).

## 3. Muted Slate/Gray Colors (Apple-Style Premium)
- Avoid loud, generic, or rainbow colors. Do not over-engineer the color palette.
- Use clean gray/slate tones (`text-slate-400`, `text-slate-500`, `bg-slate-50/50`) for secondary text, borders, and icons.
- These muted colors blend seamlessly into Hostnin's `#0070f3` (primary blue) branding without looking noisy.

## 4. Animations & Transitions
- Use subtle micro-animations for interactive elements.
- Rely on `tailwindcss-animate` utility classes: `animate-in`, `fade-in`, `slide-in-from-bottom-2`.
- Use `transition-all duration-200 hover:opacity-80` for standard button or hover states.

## 5. Consistent Parity
- Always enforce this minimalist standard across ALL chat widgets, inbox threads, and dashboard modifications.
- Do not introduce heavy modals if a lightweight inline popover or expander works better. 
