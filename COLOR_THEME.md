# TalkFuze UI Color Theme Guide

> **This file is law.** Any component, modal, badge, icon, or text in TalkFuze UI MUST follow these rules.
> No exceptions. If a color is not in this guide, it is banned.

---

## Allowed Colors (ONLY these three families)

### Blue - Primary / Action / Emphasis
Use for: buttons, links, active states, icons, focus rings, CTA, selected rows, tabs.

| Token | Use |
|---|---|
| `blue-50` | Subtle highlight backgrounds (selected row, message bubble bg, CRM card bg) |
| `blue-100` | Avatar backgrounds, label pill bg (mild) |
| `blue-200` | Borders for blue pill labels, focus rings light |
| `blue-400` | Ring offsets, muted blue accents |
| `blue-500` | Icons, inline links, small indicators |
| `blue-600` | Primary buttons, active tab underline, send button |
| `blue-700` | Primary button hover, text on blue-50/100 bg |
| `blue-800` | Dark blue text for high contrast scenarios |
| `blue-900/40` | Dark mode avatar/card backgrounds |

### Slate / Gray - Structure / Text / Borders
Use for: all text, dividers, table headers, secondary buttons, inputs, empty states.

| Token | Use |
|---|---|
| `slate-50` | Page background alternate, table header, hover on rows |
| `slate-100` | Badge backgrounds (non-primary), bulk bar bg |
| `slate-200` | Default borders (inputs, cards, dividers) |
| `slate-300` | Checkbox borders, inactive dots |
| `slate-400` | Placeholder text, muted icons |
| `slate-500` | Table header labels, secondary text, pagination |
| `slate-600` | Body text secondary, label text |
| `slate-700` | Body text primary (dark backgrounds) |
| `slate-800` | Dark mode input backgrounds, section backgrounds |
| `slate-900` | Heading text, modal backgrounds (dark mode) |

### White - Surfaces
Use for: modal bodies, card surfaces, input fields, message bubbles (agent side).

| Token | Use |
|---|---|
| `white` | Modal background, card body, input bg, page bg |

---

## BANNED Colors

The following color families are **completely prohibited** in all TalkFuze UI code:

| Family | Examples | Banned because |
|---|---|---|
| `red-*` | `bg-red-50`, `text-red-600`, `border-red-200` | Use `slate-*` for errors/warnings |
| `green-*` | `bg-green-50`, `text-green-700`, `bg-green-500` | Use `blue-*` for success/active states |
| `yellow-*` | `bg-yellow-100`, `text-yellow-700` | No yellows anywhere |
| `amber-*` | `bg-amber-500`, `text-amber-600` | No amber/orange tones |
| `orange-*` | `bg-orange-100`, `text-orange-700` | No orange |
| `purple-*` | `bg-purple-100`, `text-purple-700` | No purple |
| `violet-*` | `bg-violet-50`, `text-violet-700` | No violet |
| `pink-*` | `bg-pink-50`, `text-pink-700` | No pink |
| `rose-*` | `bg-rose-100`, `text-rose-600` | No rose |
| `indigo-*` | `bg-indigo-500`, `text-indigo-700` | Use blue instead |
| `teal-*` | `bg-teal-100`, `text-teal-700` | No teal |
| `cyan-*` | `bg-cyan-100`, `text-cyan-700` | No cyan |
| `lime-*` | `bg-lime-100`, `text-lime-700` | No lime |
| `emerald-*` | `bg-emerald-50`, `text-emerald-600` | No emerald |
| `fuchsia-*` | Any fuchsia | No fuchsia |
| `sky-*` | `bg-sky-100` | Use blue-* instead |

---

## How to Map Semantic States to This Palette

| State | Old (BANNED) | Correct |
|---|---|---|
| Success / Paid / Active | `bg-green-50 text-green-700` | `bg-blue-50 text-blue-700 border-blue-200` |
| Error / Unpaid / Warning | `bg-red-50 text-red-600` | `bg-slate-100 text-slate-700 border-slate-300` |
| Inactive / Disabled / Churned | `bg-gray-100 text-gray-500` | `bg-slate-100 text-slate-500 border-slate-200` |
| At Risk / Flagged | `text-red-500`, `bg-red-50` | `text-slate-700 font-medium` + `text-slate-500` icon |
| Score High | `text-green-600 bg-green-50` | `text-slate-500 bg-slate-100 border-slate-200` |
| Score Low | `text-red-600 bg-red-50` | `text-slate-500 bg-slate-100 border-slate-200` |
| Notes / Sticky | `bg-amber-500` button | `bg-blue-600` button |
| Save / Confirm | `text-green-600` check icon | `text-blue-600` check icon |
| Delete (destructive) | `text-red-600 bg-red-50` | `text-slate-600 hover:bg-slate-100` (no red) |
| Status Active | `bg-green-50 text-green-700 border-green-200` | `bg-blue-100 text-blue-700 border-blue-200` |
| Status Inactive | `bg-red-50 text-red-600 border-red-200` | `bg-slate-100 text-slate-600 border-slate-200` |

---

## Example Label Pills (Correct)

```tsx
// Hot Lead
'bg-blue-100 text-blue-700 border-blue-200'

// VIP (strong emphasis)
'bg-blue-600 text-white border-blue-600'

// Customer (mild)
'bg-blue-50 text-blue-600 border-blue-200'

// Unpaid / Churned (neutral, no red)
'bg-slate-200 text-slate-800 border-slate-300'

// Prospect
'bg-slate-100 text-slate-700 border-slate-200'
```

## Example Source Badges (Correct)

```tsx
// WhatsApp - gray
'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'

// Messenger - gray
'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'

// Widget / Instagram / Manual - slate shades
'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
```

---

## Rule Enforcement

Before writing any Tailwind class:
1. Is the base color `blue`, `slate`, or `white`? If yes, proceed.
2. Is it anything else? **Stop. Replace with the nearest equivalent from this guide.**
3. When in doubt: gray/slate for passive things, blue for active/important things, white for surfaces.

*Last updated: 2026-06-01*
