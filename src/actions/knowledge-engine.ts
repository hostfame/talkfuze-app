/**
 * Knowledge Engine - Smart, lean context builder for AI drafts
 *
 * Instead of feeding the entire 103KB JSON to the AI on every request,
 * this engine:
 * 1. Detects user intent from the conversation
 * 2. Injects ONLY relevant knowledge sections (pricing, domains, etc.)
 * 3. Matches top canned responses by keyword overlap
 *
 * Result: ~97% smaller prompts, faster responses, better accuracy
 */

import knowledge from "@/actions/hostnin-knowledge.json";

// ============================================================
// LEAN MARKDOWN KNOWLEDGE SECTIONS
// Built once at module init from JSON source of truth
// ============================================================

const CORE = `## Hostnin Support Info
WhatsApp: +880 1325-875955 (01325875955)
Email: support@hostnin.com, hello@hostnin.com
Website: hostnin.com
Payment: bKash, Nagad, Bank Transfer, Card (Stripe)
Bank: ISLAMI BANK, SPOTLIGHT CREATIVE, Pahartali Branch, Acc: 20502020100506002`;

const POLICIES = `## Key Policies
- 30-day money-back for hosting. Refund to original method ONLY if Hostnin's fault. Otherwise = Account Credit.
- Domains, VPS, Dedicated Servers: Non-refundable.
- Prohibited content: Adult, spam, nulled scripts, phishing, illegal.
- Free .com/.net/.org domain with yearly hosting plans (Starter and above).
- Domain transfer needs EPP/Auth code, must be 60+ days old, not expired.
- VPS: Self-managed by default, full root access. Locations: Bangladesh (BDIX), Singapore, Germany, Finland, USA.
- Dedicated Servers: Full dedicated hardware, most have setup fees (except Value AMD = Free Setup).
- If customer asks for a domain extension not in our list, say: "Check availability and price at https://hostnin.com/domain"
- Affiliate: 10% lifetime commission on all referrals. Min withdrawal 5000 BDT.`;

// Build pricing sections from JSON data (lean markdown)
function buildPricingMD(type: string): string {
  const plans = (knowledge as any).plans.filter((p: any) => p.type === type);
  if (plans.length === 0) return '';

  const monthly = plans.filter((p: any) => p.period === 'monthly');
  const yearly = plans.filter((p: any) => p.period === 'yearly');

  let md = `## ${type} Pricing (BDT)\n`;

  if (monthly.length > 0 && yearly.length > 0) {
    md += `| Plan | Monthly | Yearly |\n|---|---|---|\n`;
    const names = [...new Set(monthly.map((p: any) => p.name))] as string[];
    for (const name of names) {
      const m = monthly.find((p: any) => p.name === name);
      const y = yearly.find((p: any) => p.name === name);
      md += `| ${name} | ৳${m?.price || 'N/A'} | ৳${y?.price || 'N/A'} |\n`;
    }
  } else {
    md += `| Plan | Price/mo | Specs |\n|---|---|---|\n`;
    for (const p of plans) {
      const specs = ((p as any).server || []).join(', ');
      const setup = (p as any).setupFee ? ` (Setup: ৳${(p as any).setupFee})` : '';
      md += `| ${p.name} | ৳${p.price}/mo${setup} | ${specs} |\n`;
    }
  }

  // Add features for context
  if (monthly.length > 0 && monthly[0].features) {
    md += `Includes: ${monthly[0].features.slice(0, 5).join(', ')}\n`;
  }

  return md;
}

// Pre-build all pricing sections at module load
const PRICING: Record<string, string> = {
  web: buildPricingMD('Web Hosting'),
  wordpress: buildPricingMD('WordPress Hosting'),
  cloud: buildPricingMD('Cloud Hosting'),
  turbo: buildPricingMD('Turbo NVMe Hosting'),
  bdix: buildPricingMD('BDIX Hosting'),
  vps: buildPricingMD('VPS Hosting'),
  dedicated: buildPricingMD('Dedicated Server'),
  woocommerce: buildPricingMD('WooCommerce Hosting'),
  nodejs: buildPricingMD('Node.js Hosting'),
  n8n: buildPricingMD('N8n App Hosting'),
};

const DOMAINS = `## Domain Pricing (BDT/year)\n${(knowledge as any).domains.map((d: any) => `${d.tld}: ৳${d.price}`).join(' | ')}\nFor other extensions: https://hostnin.com/domain`;

const COMPARISONS = `## Hosting Comparisons\n${(knowledge as any).comparisons.join('\n')}`;

// ============================================================
// INTENT DETECTION
// ============================================================

type Intent =
  | 'pricing_web' | 'pricing_wordpress' | 'pricing_cloud' | 'pricing_turbo'
  | 'pricing_bdix' | 'pricing_vps' | 'pricing_dedicated' | 'pricing_woocommerce'
  | 'pricing_nodejs' | 'pricing_n8n'
  | 'domain' | 'billing' | 'technical' | 'migration' | 'comparison';

const INTENT_PATTERNS: [Intent, RegExp][] = [
  ['pricing_vps', /\bvps\b|ভিপিএস|virtual\s*private/i],
  ['pricing_dedicated', /\bdedicated\b|bare\s*metal|ডেডিকেটেড/i],
  ['pricing_wordpress', /\bwordpress\b|wp\s*host|ওয়ার্ডপ্রেস/i],
  ['pricing_woocommerce', /\bwoocommerce\b|woo\s*commerce|উকমার্স|ই-কমার্স|ecommerce\s*host/i],
  ['pricing_cloud', /\bcloud\s*host|\bcloud\s*plan|ক্লাউড\s*হোস্ট/i],
  ['pricing_turbo', /\bturbo\b|nvme\s*host|টার্বো/i],
  ['pricing_bdix', /\bbdix\b|বিডিআইএক্স/i],
  ['pricing_nodejs', /\bnode\.?js\b|\bmern\b|নোড/i],
  ['pricing_n8n', /\bn8n\b|automation\s*host/i],
  ['pricing_web', /web\s*host|shared\s*host|হোস্টিং\s*(দাম|প্রাইস|কত)|hosting\s*(price|cost|plan)/i],
  ['domain', /\bdomain\b|ডোমেইন|\.com\b|\.net\b|\.org\b|\.io\b|\.xyz\b|\.bd\b|\.online\b|\btld\b|transfer\s*domain/i],
  ['billing', /\binvoice\b|\bpayment\b|\bbkash\b|বিকাশ|\bnagad\b|নগদ|\bpay\b|\bbill\b|\brefund\b|পেমেন্ট|বিল|টাকা|\btaka\b|\brenew/i],
  ['technical', /\bcpanel\b|সিপ্যানেল|\bssl\b|\bdns\b|\bnameserver\b|\berror\b|এরর|\bdown\b|\bslow\b|\bspeed\b|\bbackup\b|\bip\s*block/i],
  ['migration', /\bmigrat|\btransfer\s*site|\bmove\s*site|মাইগ্রেশন|ট্রান্সফার|\bshift\b/i],
  ['comparison', /\bcompare\b|\bvs\b|\bversus\b|\bdifference\b|কোনটা\s*ভালো|which\s*(one|plan|hosting)/i],
];

function detectIntents(text: string): Intent[] {
  const intents: Intent[] = [];
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) intents.push(intent);
  }
  // Generic pricing fallback
  if (intents.length === 0 && /\b(price|pricing|cost|কত|দাম|প্রাইস|plan|package)\b/i.test(text)) {
    intents.push('pricing_web');
  }
  return [...new Set(intents)]; // deduplicate
}

// ============================================================
// CANNED RESPONSE MATCHING (keyword overlap)
// ============================================================

interface CannedEntry {
  title: string;
  content: string;
  words: Set<string>;
}

const cannedEntries: CannedEntry[] = Object.entries(
  (knowledge as any).canned_responses || {}
).map(([title, content]) => ({
  title,
  content: content as string,
  words: new Set(
    (title + ' ' + (content as string))
      .toLowerCase()
      .split(/[\s\u0964\u0965.,!?;:()\[\]{}"']+/)
      .filter((w: string) => w.length > 2)
  ),
}));

export function getRelevantCannedResponses(userMessage: string, limit = 3): string[] {
  const queryWords = userMessage
    .toLowerCase()
    .split(/[\s\u0964\u0965.,!?;:()\[\]{}"']+/)
    .filter(w => w.length > 2);

  if (queryWords.length === 0) return [];

  const scored = cannedEntries
    .map(entry => {
      let score = 0;
      for (const word of queryWords) {
        if (entry.words.has(word)) score++;
      }
      // Boost if title matches strongly
      const titleLower = entry.title.toLowerCase();
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 2;
      }
      return { content: entry.content, score };
    })
    .filter(s => s.score > 1) // require at least 2 word overlap to reduce noise
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(s => s.content);
}

// ============================================================
// MAIN BUILDER - Exported function used by the draft route
// ============================================================

const INTENT_TO_PRICING: Record<string, string> = {
  pricing_web: 'web',
  pricing_wordpress: 'wordpress',
  pricing_cloud: 'cloud',
  pricing_turbo: 'turbo',
  pricing_bdix: 'bdix',
  pricing_vps: 'vps',
  pricing_dedicated: 'dedicated',
  pricing_woocommerce: 'woocommerce',
  pricing_nodejs: 'nodejs',
  pricing_n8n: 'n8n',
};

export function buildKnowledgeContext(contextMessages: string): string {
  const intents = detectIntents(contextMessages);

  // Always include core info + policies (lean, ~400 tokens)
  const sections: string[] = [CORE, POLICIES];

  // Inject only relevant pricing sections based on detected intent
  for (const intent of intents) {
    const pricingKey = INTENT_TO_PRICING[intent];
    if (pricingKey && PRICING[pricingKey]) {
      sections.push(PRICING[pricingKey]);
    }
    if (intent === 'domain') sections.push(DOMAINS);
    if (intent === 'comparison') sections.push(COMPARISONS);
  }

  // Match top 3 canned responses by keyword overlap
  const cannedMatches = getRelevantCannedResponses(contextMessages, 3);
  if (cannedMatches.length > 0) {
    sections.push(
      `## Reference Responses (match this tone and style)\n${cannedMatches.join('\n---\n')}`
    );
  }

  return sections.filter(Boolean).join('\n\n');
}

// For debugging/monitoring
export function getIntentDebug(contextMessages: string) {
  return {
    intents: detectIntents(contextMessages),
    cannedMatches: getRelevantCannedResponses(contextMessages, 3).length,
  };
}
