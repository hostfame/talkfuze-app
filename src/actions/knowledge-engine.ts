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

export function getGlobalBrain(language: 'Bengali' | 'English'): string {
  if (language === 'English') {
    return `<rules>
- Confidence Thresholding (STRICT): This rule applies to EVERYTHING (Domains, Hosting, Nameservers, IPs, Transaction IDs). If a customer provides ANY data that is not explicitly in your knowledge base, DO NOT confidently say "This is not ours", "This is invalid", or guess the status. Instead, you MUST ask EXACTLY: "Could you please provide your registered email or domain name so I can check your account and verify this?"
</rules>`;
  }

  return `<rules>
- Confidence Thresholding (STRICT): This rule applies to EVERYTHING (Domains, Hosting, Nameservers, IPs, Transaction IDs). If a customer provides ANY data that is not explicitly in your knowledge base, DO NOT confidently say "This is not ours", "This is invalid", or guess the status. Instead, you MUST ask EXACTLY: "অনুগ্রহপুর্বক আপনার ডোমেইন লিংকটি দিন যাতে আমি চেক করতে পারি।"
- Bengali Tone & Phrasing (CRITICAL): Write like a modern Bangladeshi tech startup - casual, direct, transliterated English for all tech/business terms. Never use classic, textbook, or literary Bengali. If an English word is commonly used in spoken Bengali tech conversations (visitor, plan, website, server, hosting, package, traffic, target, speed, update), keep it transliterated in Bengali script instead of translating it. Study these exact examples of our style:
  1) "অনুগ্রহপুর্বক আপনার ডোমেইন লিংকটি দিন যাতে আমি চেক করতে পারি।"
  2) "আমরা ডোমেইন হোস্টিং ইন্ডাস্ট্রিতে ৫ বছরের বেশি সময় ধরে বিশ্বস্ততার সাথে সার্ভিস দিয়ে আসছি। গুগলে আমাদের নাম লিখে সার্চ করলে অসংখ্য পজিটিভ রিভিউ পেয়ে যাবেন, যা প্রমাণ করে আমাদের সেবা কতটা জনপ্রিয়।"
  3) "আমি কি আর কোন তথ্য দিয়ে সহযোগিতা করতে পারি?"
  4) "জ্বী বলুন, আপনাকে কিভাবে সহযোগিতা করতে পারি?"
  5) "ধন্যবাদ, আমি বিষয়টি চেক করছি এবং খুব দ্রুতই এই ব্যাপারে আপডেট পাবেন। সময় দিয়ে সহযোগিতার জন্য আন্তরিকভাবে ধন্যবাদ।"
</rules>`;
}

// Keep backward-compat static export for any other consumers
export const GLOBAL_BRAIN = getGlobalBrain('Bengali');

export const SUB_BRAINS = {
  sales: `## Sales & Pricing Policies
- Pricing Confusion (e.g., 549tk plan): If a user asks for a "549tk plan" or sees "(Eqv. ৳399/mo)", this refers to the discounted monthly breakdown of the 3-Year plan. This is NOT a monthly billing plan. Always check the '1-Month Billing' column for actual monthly prices.
- If customer asks for a domain extension not in our list, say: "Check availability and price at https://hostnin.com/domain"
- Affiliate: 10% lifetime commission on all referrals. Min withdrawal 5000 BDT.
- Order any plan at: https://hostnin.com or https://my.hostnin.com`,
  
  tech: `## Technical & Infrastructure Policies
- 99.9% Uptime Guarantee on all hosting plans.
- All shared/cloud/turbo hosting includes: Free SSL, LiteSpeed Web Server, cPanel, Daily Backups.
- VPS: Self-managed by default, full root access. Locations: Bangladesh (BDIX), Singapore, Germany, Finland, USA.
- Dedicated Servers: Full dedicated hardware, most have setup fees (except Value AMD = Free Setup).
- MySQL/Database: External MySQL connections are NOT allowed on standard Web/Cloud Hosting or BDIX VPS for security reasons. We DO allow external MySQL connections on Node.js Hosting.
- Nameservers: If a customer asks for their nameservers, you MUST exclusively check their 'Customer CRM Profile' (Active Services) in this prompt. Do NOT guess from RAG context, as RAG contains other customers' data. If they have 0 hostings (or no profile), ALWAYS use this EXACT phrase to ask for their domain:
  * English: "Could you please provide your domain link so I can check?"
  * Bengali: "অনুগ্রহপুর্বক আপনার ডোমেইন লিংকটি দিন যাতে আমি চেক করতে পারি।"
  Do NOT write anything else. If they have exactly 1 active hosting, provide its 'nameservers' directly. If they have multiple hostings, list the products and ask which domain they need the nameservers for. Generic rule: All our web hosting nameservers end in \`balancedserver.com\` (e.g., nova.balancedserver.com). If they provide a nameserver ending in \`balancedserver.com\` or \`stackdns.com\`, confirm it IS ours.`,
  
  billing: `## Billing & Account Policies
- 30-day money-back for hosting. Refund to original method ONLY if Hostnin's fault. Otherwise = Account Credit.
- Domains, VPS, Dedicated Servers: Non-refundable.
- Prohibited content: Adult, spam, nulled scripts, phishing, illegal.
- Free .com/.net/.org domain with yearly hosting plans (Starter and above).
- Domain transfer needs EPP/Auth code, must be 60+ days old, not expired.`
};;

export function getSubBrain(key: string, language: 'Bengali' | 'English'): string {
  const brain = (SUB_BRAINS as any)[key] || '';
  if (!brain) return '';
  // For English conversations, strip the Bengali nameserver phrase from tech brain
  if (language === 'English' && key === 'tech') {
    return brain.replace(/\n\s*\* Bengali:.*$/m, '');
  }
  return brain;
}

// Build pricing sections from JSON data with full specs per plan
function buildPricingMD(type: string): string {
  const plans = (knowledge as any).plans.filter((p: any) => p.type === type);
  if (plans.length === 0) return '';

  const monthly = plans.filter((p: any) => p.period === 'monthly');
  const yearly = plans.filter((p: any) => p.period === 'yearly');
  const triennially = plans.filter((p: any) => p.period === '3-years');

  let md = `## ${type} Pricing (BDT)\n`;

  if (type === 'WordPress Hosting') {
    md += `> [!WARNING] STRICT POLICY: If providing these prices, you MUST explicitly tell the user: "This plan will be slow from Bangladesh (optimized for UK/US traffic) and only allows 1 website/domain per hosting account (no addon domains)." DO NOT provide prices without this warning.\n\n`;
  } else if (type === 'Cloud Hosting') {
    md += `> [!WARNING] STRICT POLICY: If providing these prices, you MUST explicitly tell the user: "This plan will be slow from Bangladesh (optimized for UK/US traffic). It is only recommended if you need massive storage." DO NOT provide prices without this warning.\n\n`;
  }

  if (monthly.length > 0 && yearly.length > 0) {
    // Shared hosting style: show monthly + yearly + specs per plan
    md += `| Plan | 1-Month Billing | 1-Year Billing | 3-Year Billing | Specs |\n|---|---|---|---|---|\n`;
    const names = [...new Set(monthly.map((p: any) => p.name))] as string[];
    for (const name of names) {
      const m = monthly.find((p: any) => p.name === name);
      const y = yearly.find((p: any) => p.name === name);
      const t = triennially.find((p: any) => p.name === name);
      const specs = (m?.server || []).join(', ') || (m?.features || []).slice(0, 4).join(', ');
      
      const mPrice = m ? `৳${m.price}` : 'N/A';
      const yPrice = y ? `৳${y.price} (Eqv. ৳${y.monthlyBreakdown}/mo)` : 'N/A';
      const tPrice = t ? `৳${t.price} (Eqv. ৳${t.monthlyBreakdown}/mo)` : 'N/A';
      
      md += `| ${name} | ${mPrice} | ${yPrice} | ${tPrice} | ${specs} |\n`;
    }
  } else {
    // VPS/Dedicated style: show price + full specs
    md += `| Plan | Price/mo | Specs |\n|---|---|---|\n`;
    for (const p of plans) {
      const specs = ((p as any).server || []).join(', ');
      const setup = (p as any).setupFee ? ` (Setup: ৳${(p as any).setupFee})` : '';
      md += `| ${p.name} | ৳${p.price}/mo${setup} | ${specs} |\n`;
    }
  }

  // Add common features only if they exist and are non-empty
  if (monthly.length > 0 && monthly[0].features) {
    const features = monthly[0].features.filter((f: string) => f && f.trim().length > 0);
    if (features.length > 0) {
      md += `All plans include: ${features.slice(0, 6).join(', ')}\n`;
    }
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

function buildDomainContext(userMessage: string): string {
  const allDomains = (knowledge as any).domains || [];
  if (allDomains.length === 0) return '';
  
  // Always include top popular domains for BD market
  const topTlds = new Set(['.com', '.net', '.org', '.xyz', '.info', '.com.bd', '.online', '.store', '.shop', '.co']);
  
  // Extract mentioned domains from user message (e.g., .tech, .io)
  const mentionedTlds = new Set<string>();
  const matches = userMessage.match(/\.[a-z]{2,}/ig);
  if (matches) {
    matches.forEach(m => mentionedTlds.add(m.toLowerCase()));
  }

  const selectedDomains = allDomains.filter((d: any) => topTlds.has(d.tld) || mentionedTlds.has(d.tld));
  const finalDomains = selectedDomains.length > 0 ? selectedDomains : allDomains.slice(0, 10);
  
  const pricingLines = finalDomains.map((d: any) => {
    const renew = d.renew || d.price;
    const transfer = d.transfer || d.price;
    if (d.price === renew && d.price === transfer) {
      return `${d.tld} (Reg/Renew/Transfer: ৳${d.price})`;
    }
    return `${d.tld} (Reg: ৳${d.price}, Ren: ৳${renew}, Trans: ৳${transfer})`;
  });

  return `## Domain Pricing (BDT/year)\n${pricingLines.join(' | ')}\nFor other extensions, say: "Check availability and exact pricing at https://hostnin.com/domain"`;
}

const COMPARISONS = `## Hosting Comparisons\n${(knowledge as any).comparisons.join('\n')}`;

// ============================================================
// INTENT DETECTION
// ============================================================

type Intent =
  | 'pricing_web' | 'pricing_wordpress' | 'pricing_cloud' | 'pricing_turbo'
  | 'pricing_bdix' | 'pricing_vps' | 'pricing_dedicated' | 'pricing_woocommerce'
  | 'pricing_nodejs' | 'pricing_n8n'
  | 'domain' | 'billing' | 'technical' | 'migration' | 'comparison' | 'pricing_objection';

const INTENT_PATTERNS: [Intent, RegExp][] = [
  // Specific products first (checked before generic web hosting)
  ['pricing_vps', /\bvps\b|ভিপিএস|virtual\s*private/i],
  ['pricing_dedicated', /\bdedicated\b|bare\s*metal|ডেডিকেটেড/i],
  ['pricing_wordpress', /\bwordpres{1,2}\b|wp\s*host|ওয়ার্ডপ্রেস/i],
  ['pricing_woocommerce', /\bwoocomm?erce\b|woo\s*commerce|উকমার্স|ই-কমার্স|ecommerce|online\s*store|অনলাইন\s*স্টোর/i],
  ['pricing_cloud', /\bcloud\b|ক্লাউড/i],
  ['pricing_turbo', /\bturbo\b|nvme\s*host|টার্বো/i],
  ['pricing_bdix', /\bbdix\b|বিডিআইএক্স/i],
  ['pricing_nodejs', /\bnode\.?js\b|\bmern\b|নোড/i],
  ['pricing_n8n', /\bn8n\b|automation\s*host/i],
  // Generic web hosting (will be suppressed if a specific product matched)
  ['pricing_web', /web\s*host|shared\s*host|হোস্টিং\s*(দাম|প্রাইস|কত)|hosting\s*(price|cost|plan)/i],
  ['domain', /\bdomain\b|ডোমেইন|\.com\b|\.net\b|\.org\b|\.io\b|\.xyz\b|\.bd\b|\.online\b|\btld\b|transfer\s*domain/i],
  ['billing', /\binvoice\b|\bpayment\b|\bbkash\b|বিকাশ|\bnagad\b|নগদ|\bpay\b|\bbill(ing)?\b|\brefund\b|পেমেন্ট|বিল|টাকা|\brenew/i],
  ['technical', /\bcpanel\b|সিপ্যানেল|\bssl\b|\bdns\b|\bnameserver\b|\berror\b|এরর|\bdown\b|\bdowntime\b|\bslow\b|\bbackup\b|\bip\s*block|আইপি\s*ব্লক/i],
  ['migration', /\bmigrat|\btransfer\b.*\b(site|hosting|from|to|korte|kora|my)\b|\bmov(e|ing)\b.*\b(site|from|to)\b|মাইগ্রেশন|ট্রান্সফার|\bshift\b/i],
  ['comparison', /\bcompare\b|\bcomparison\b|\bvs\b|\bversus\b|\bdifference\b|কোনটা\s*ভালো|which\b.{0,30}\b(one|plan|hosting)\b|\bbetter\b/i],
  ['pricing_objection', /\bexpensiv|\bcostly\b|\boverpriced\b|\btoo\s*(much|high)|\bhigh.{0,10}pric|দামী|দামি|বেশ[িী]|অনেক.{0,10}দাম|দাম.{0,10}(অনেক|বেশ)|beshi|dami|dam\s*beshi/i],
];

// Specific pricing intents (if any of these matched, suppress generic pricing_web)
const SPECIFIC_PRICING_INTENTS = new Set([
  'pricing_wordpress', 'pricing_cloud', 'pricing_turbo', 'pricing_bdix',
  'pricing_vps', 'pricing_dedicated', 'pricing_woocommerce', 'pricing_nodejs', 'pricing_n8n'
]);

function detectIntents(text: string): Intent[] {
  const intents: Intent[] = [];
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) intents.push(intent);
  }

  // Suppress generic pricing_web if a specific product was already detected
  const hasSpecific = intents.some(i => SPECIFIC_PRICING_INTENTS.has(i));
  if (hasSpecific) {
    const filtered = intents.filter(i => i !== 'pricing_web');
    if (filtered.length > 0) return [...new Set(filtered)];
  }

  // Generic pricing fallback (only if nothing specific matched)
  if (intents.length === 0 && /\b(prices?|pricing|কত|দাম|প্রাইস|plan|package|dam|daam|koto|tk|taka|tkr|bdt)\b/i.test(text)) {
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

export function getRelevantCannedResponses(userMessage: string, limit = 3): { title: string, content: string }[] {
  const queryWords = userMessage
    .toLowerCase()
    .split(/[\s\u0964\u0965.,!?;:()\[\]{}"']+/)
    .filter(w => w.length > 2);

  if (queryWords.length === 0) return [];

  const scored = cannedEntries
    .map(entry => {
      let score = 0;
      for (const word of queryWords) {
        // Exact word match
        if (entry.words.has(word)) score++;
        // Substring match for Bengali words (they can be long compound words)
        else {
          for (const entryWord of entry.words) {
            if (entryWord.length >= 3 && (entryWord.includes(word) || word.includes(entryWord))) {
              score += 0.5;
              break;
            }
          }
        }
      }
      // Boost if title matches strongly
      const titleLower = entry.title.toLowerCase();
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 2;
      }
      return { title: entry.title, content: entry.content, score };
    })
    .filter(s => s.score > 1) // require at least 2 word overlap to reduce noise
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(s => ({ title: s.title, content: s.content }));
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

export function buildKnowledgeContext(contextMessages: string): { context: string, sources: string[] } {
  const intents = detectIntents(contextMessages);

  // Core info and policies are now permanently cached in SYSTEM_PROMPT.
  // We only load dynamic, intent-specific RAG sections here.
  const sections: string[] = [];
  const sources: string[] = [];

  let hasPricing = false;

  // Inject only relevant pricing sections based on detected intent
  for (const intent of intents) {
    const pricingKey = INTENT_TO_PRICING[intent];
    if (pricingKey && PRICING[pricingKey]) {
      sections.push(PRICING[pricingKey]);
      sources.push(`${pricingKey} Pricing`);
      hasPricing = true;
    }
    if (intent === 'domain') { 
      sections.push(buildDomainContext(contextMessages)); 
      sources.push('Domain Pricing'); 
      hasPricing = true; 
    }
    if (intent === 'comparison') { sections.push(COMPARISONS); sources.push('Hosting Comparisons'); }
    if (intent === 'pricing_objection') {
      // Force-inject the /expensive canned response as THE reference reply
      const expensiveReply = (knowledge as any).canned_responses?.['expensive'];
      if (expensiveReply) {
        sections.push(`## PRICING OBJECTION HANDLER (customer thinks we're expensive, use this as your primary reference)\n${expensiveReply}`);
        sources.push('Canned Response: expensive');
      }
    }
  }

  if (hasPricing) {
    sections.unshift(`## Strict Pricing Rules (ANTI-HALLUCINATION)
- FOUNDATIONAL RULE: You must NEVER invent, guess, or mathematically calculate prices.
- Look at the provided data table. If the EXACT price for the requested plan, billing term, or domain extension is NOT explicitly written, you MUST NOT provide a number.
- FALLBACK PROTOCOL: If you cannot find the exact price, do NOT apologize. Provide the relevant link from the reference list below and politely say: "Please check the detailed pricing and availability here."
[Fallback Links]: Web: https://hostnin.com/hosting/web-hosting | Cloud: https://hostnin.com/hosting/cloud-hosting | WordPress: https://hostnin.com/hosting/wordpress-hosting | Reseller: https://hostnin.com/hosting/reseller-hosting | BDIX: https://hostnin.com/hosting/bdix-hosting | Turbo: https://hostnin.com/hosting/turbo-hosting | NodeJS: https://hostnin.com/hosting/nodejs-hosting | WooCommerce: https://hostnin.com/hosting/woocommerce-hosting | VPS: https://hostnin.com/hosting/vps-hosting | Dedicated: https://hostnin.com/hosting/dedicated-server | Domain: https://hostnin.com/domain | Email: https://hostnin.com/solutions/email | Backup: https://hostnin.com/solutions/backup | Security/Malware: https://hostnin.com/solutions/security | SiteBuilder: https://hostnin.com/solutions/site-builder | SSL: https://hostnin.com/solutions/ssl | Monitoring: https://hostnin.com/solutions/monitoring | General/Compare: https://hostnin.com/pricing`);
  }

  // Match top 3 canned responses by keyword overlap
  const cannedMatches = getRelevantCannedResponses(contextMessages, 3);
  if (cannedMatches.length > 0) {
    sections.push(
      `## Reference Responses (match this tone and style)\n${cannedMatches.map(c => c.content).join('\n---\n')}`
    );
    cannedMatches.forEach(c => sources.push(`Canned: ${c.title}`));
  }

  return { context: sections.filter(Boolean).join('\n\n'), sources: [...new Set(sources)] };
}

// For debugging/monitoring
export function getIntentDebug(contextMessages: string) {
  return {
    intents: detectIntents(contextMessages),
    cannedMatches: getRelevantCannedResponses(contextMessages, 3).length,
  };
}
