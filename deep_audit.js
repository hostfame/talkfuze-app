const fs = require('fs');
const knowledge = JSON.parse(fs.readFileSync('/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json', 'utf8'));

// ===== Replicate engine EXACTLY =====
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

function buildPricingMD(type) {
  const plans = knowledge.plans.filter(p => p.type === type);
  if (plans.length === 0) return '';
  const monthly = plans.filter(p => p.period === 'monthly');
  const yearly = plans.filter(p => p.period === 'yearly');
  let md = `## ${type} Pricing (BDT)\n`;
  if (monthly.length > 0 && yearly.length > 0) {
    md += `| Plan | Monthly | Yearly |\n|---|---|---|\n`;
    const names = [...new Set(monthly.map(p => p.name))];
    for (const name of names) {
      const m = monthly.find(p => p.name === name);
      const y = yearly.find(p => p.name === name);
      md += `| ${name} | ৳${m?.price || 'N/A'} | ৳${y?.price || 'N/A'} |\n`;
    }
  } else {
    md += `| Plan | Price/mo | Specs |\n|---|---|---|\n`;
    for (const p of plans) {
      const specs = (p.server || []).join(', ');
      const setup = p.setupFee ? ` (Setup: ৳${p.setupFee})` : '';
      md += `| ${p.name} | ৳${p.price}/mo${setup} | ${specs} |\n`;
    }
  }
  if (monthly.length > 0 && monthly[0].features) {
    md += `Includes: ${monthly[0].features.slice(0, 5).join(', ')}\n`;
  }
  return md;
}

const PRICING = {};
['Web Hosting','WordPress Hosting','Cloud Hosting','Turbo NVMe Hosting','BDIX Hosting',
 'VPS Hosting','Dedicated Server','WooCommerce Hosting','Node.js Hosting','N8n App Hosting']
.forEach(t => { PRICING[t] = buildPricingMD(t); });

const DOMAINS = `## Domain Pricing (BDT/year)\n${knowledge.domains.map(d => d.tld + ': ৳' + d.price).join(' | ')}\nFor other extensions: https://hostnin.com/domain`;

// ===== DEEP AUDIT: What does the AI actually SEE? =====
console.log('='.repeat(80));
console.log('DEEP AUDIT: What The AI Actually Receives');
console.log('='.repeat(80));

// Print each pricing section + token count
console.log('\n📊 AUDIT 1: Quality of Each Knowledge Section');
console.log('-'.repeat(60));
for (const [type, md] of Object.entries(PRICING)) {
  const tokens = Math.round(md.length / 4);
  const lines = md.split('\n').filter(Boolean).length;
  console.log(`\n--- ${type} (${tokens} tokens, ${lines} lines) ---`);
  console.log(md.substring(0, 500));
  if (md.length > 500) console.log('  ... [truncated]');
}

// AUDIT 2: VPS section is huge - check if it's useful
console.log('\n\n📊 AUDIT 2: VPS Section Size Problem');
console.log('-'.repeat(60));
const vpsPlans = knowledge.plans.filter(p => p.type === 'VPS Hosting');
console.log(`VPS has ${vpsPlans.length} plans across 4 locations`);
console.log(`VPS section size: ${PRICING['VPS Hosting'].length} chars ≈ ${Math.round(PRICING['VPS Hosting'].length/4)} tokens`);
console.log('PROBLEM: AI gets ALL 20 VPS plans even if customer only asks about Bangladesh VPS');
console.log('This is still bloated compared to web hosting (4 plans)');

// AUDIT 3: What's MISSING from the knowledge?
console.log('\n\n📊 AUDIT 3: What Information Is MISSING?');
console.log('-'.repeat(60));
const missingChecks = [
  { check: "Free migration mentioned?", found: POLICIES.includes('migration') || POLICIES.includes('free') },
  { check: "Uptime guarantee (99.9%)?", found: POLICIES.includes('uptime') || POLICIES.includes('99.9') },
  { check: "Money-back days specified?", found: POLICIES.includes('30-day') },
  { check: "Nameserver addresses?", found: CORE.includes('ns1') || CORE.includes('nameserver') },
  { check: "Server locations listed?", found: POLICIES.includes('Singapore') },
  { check: "cPanel included info?", found: Object.values(PRICING).some(p => p.includes('cPanel')) },
  { check: "LiteSpeed mentioned?", found: Object.values(PRICING).some(p => p.includes('LiteSpeed')) },
  { check: "Daily backups mentioned?", found: Object.values(PRICING).some(p => p.includes('Backup')) || Object.values(PRICING).some(p => p.includes('backup')) },
  { check: "Free SSL mentioned?", found: Object.values(PRICING).some(p => p.includes('SSL')) },
  { check: "DDoS protection mentioned?", found: Object.values(PRICING).some(p => p.includes('DDoS')) },
  { check: "Bandwidth/storage in plans?", found: Object.values(PRICING).some(p => p.includes('GB') || p.includes('TB')) },
  { check: "Order URL for customers?", found: CORE.includes('order') || POLICIES.includes('order') || CORE.includes('hostnin.com') },
];
for (const mc of missingChecks) {
  console.log(`  ${mc.found ? '✅' : '❌ MISSING'} ${mc.check}`);
}

// AUDIT 4: Feature details in pricing sections
console.log('\n\n📊 AUDIT 4: Do Pricing Sections Include Specs?');
console.log('-'.repeat(60));
for (const [type, md] of Object.entries(PRICING)) {
  const hasSpecs = md.includes('GB') || md.includes('TB') || md.includes('Core') || md.includes('NVMe');
  const hasFeatures = md.includes('Includes:');
  console.log(`  ${type.padEnd(25)} Specs: ${hasSpecs ? '✅' : '❌'}  Features: ${hasFeatures ? '✅' : '❌'}`);
}

// AUDIT 5: The Web Hosting section - most commonly asked
console.log('\n\n📊 AUDIT 5: Web Hosting Section (Most Common Query)');
console.log('-'.repeat(60));
console.log(PRICING['Web Hosting']);
console.log('\nPROBLEM CHECK: Does this tell AI what each plan includes?');
const webFeatures = knowledge.plans.filter(p => p.type === 'Web Hosting' && p.period === 'monthly');
for (const p of webFeatures) {
  console.log(`  ${p.name}: features=${(p.features||[]).length}, server=${(p.server||[]).length}`);
  if (p.server) console.log(`    Specs: ${p.server.join(', ')}`);
}

// AUDIT 6: Token comparison - old vs new for each scenario
console.log('\n\n📊 AUDIT 6: OLD vs NEW - What AI sees for "web hosting price"');
console.log('-'.repeat(60));
const oldJSON = JSON.stringify(knowledge);
const oldTokens = Math.round(oldJSON.length / 4);
const newWebSection = [CORE, POLICIES, PRICING['Web Hosting']].join('\n\n');
const newTokens = Math.round(newWebSection.length / 4);
console.log(`OLD: ${oldTokens} tokens - AI sees EVERY plan, EVERY domain, EVERY canned response`);
console.log(`NEW: ${newTokens} tokens - AI sees only Core + Policies + Web Hosting`);
console.log(`Reduction: ${Math.round((1 - newTokens/oldTokens) * 100)}%`);
console.log(`\nBUT: Is the new context SUFFICIENT?`);
console.log(`Does AI know plan specs (disk, bandwidth, sites)?`);

// Check if server/feature data is in the built markdown
const webMD = PRICING['Web Hosting'];
console.log(`  Contains disk sizes? ${webMD.includes('GB') || webMD.includes('SSD') ? 'YES' : 'NO ❌'}`);
console.log(`  Contains bandwidth? ${webMD.includes('Bandwidth') || webMD.includes('bandwidth') ? 'YES' : 'NO ❌'}`);
console.log(`  Contains # websites? ${webMD.includes('Website') || webMD.includes('website') ? 'YES' : 'NO ❌'}`);
console.log(`  Contains feature list? ${webMD.includes('Includes:') ? 'YES' : 'NO ❌'}`);

console.log('\n' + '='.repeat(80));
console.log('END OF DEEP AUDIT');
console.log('='.repeat(80));
