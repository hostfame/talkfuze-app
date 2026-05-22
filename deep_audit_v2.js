const fs = require('fs');
const knowledge = JSON.parse(fs.readFileSync('/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json', 'utf8'));

// Replicate UPDATED engine
const POLICIES = `## Key Policies
- 99.9% Uptime Guarantee on all hosting plans.
- All shared/cloud/turbo hosting includes: Free SSL, LiteSpeed Web Server, cPanel, Daily Backups.
- Free website migration from any provider (we handle it for you).
- 30-day money-back for hosting. Refund to original method ONLY if Hostnin's fault. Otherwise = Account Credit.
- Domains, VPS, Dedicated Servers: Non-refundable.
- Prohibited content: Adult, spam, nulled scripts, phishing, illegal.
- Free .com/.net/.org domain with yearly hosting plans (Starter and above).
- Domain transfer needs EPP/Auth code, must be 60+ days old, not expired.
- VPS: Self-managed by default, full root access. Locations: Bangladesh (BDIX), Singapore, Germany, Finland, USA.
- Dedicated Servers: Full dedicated hardware, most have setup fees (except Value AMD = Free Setup).
- If customer asks for a domain extension not in our list, say: "Check availability and price at https://hostnin.com/domain"
- Affiliate: 10% lifetime commission on all referrals. Min withdrawal 5000 BDT.
- Nameservers: ns1.stackdns.com, ns2.stackdns.com (for shared/cloud/turbo/bdix hosting).
- Order any plan at: https://hostnin.com or https://my.hostnin.com`;

function buildPricingMD(type) {
  const plans = knowledge.plans.filter(p => p.type === type);
  if (plans.length === 0) return '';
  const monthly = plans.filter(p => p.period === 'monthly');
  const yearly = plans.filter(p => p.period === 'yearly');
  let md = `## ${type} Pricing (BDT)\n`;
  if (monthly.length > 0 && yearly.length > 0) {
    md += `| Plan | Monthly | Yearly | Specs |\n|---|---|---|---|\n`;
    const names = [...new Set(monthly.map(p => p.name))];
    for (const name of names) {
      const m = monthly.find(p => p.name === name);
      const y = yearly.find(p => p.name === name);
      const specs = (m?.server || []).join(', ') || (m?.features || []).slice(0, 4).join(', ');
      md += `| ${name} | ৳${m?.price || 'N/A'} | ৳${y?.price || 'N/A'} | ${specs} |\n`;
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
    const features = monthly[0].features.filter(f => f && f.trim().length > 0);
    if (features.length > 0) md += `All plans include: ${features.slice(0, 6).join(', ')}\n`;
  }
  return md;
}

const PRICING = {};
['Web Hosting','WordPress Hosting','Cloud Hosting','Turbo NVMe Hosting','BDIX Hosting',
 'VPS Hosting','Dedicated Server','WooCommerce Hosting','Node.js Hosting','N8n App Hosting']
.forEach(t => { PRICING[t] = buildPricingMD(t); });

console.log('='.repeat(80));
console.log('V2 DEEP AUDIT: Fixed Knowledge Sections');
console.log('='.repeat(80));

// 1. Check missing items are now present
console.log('\n📋 MISSING ITEMS CHECK:');
const checks = [
  { check: "Free migration", found: POLICIES.includes('migration') },
  { check: "Uptime 99.9%", found: POLICIES.includes('99.9%') },
  { check: "Nameservers", found: POLICIES.includes('ns1.stackdns.com') },
  { check: "Free SSL", found: POLICIES.includes('Free SSL') },
  { check: "LiteSpeed", found: POLICIES.includes('LiteSpeed') },
  { check: "Daily Backups", found: POLICIES.includes('Daily Backups') },
  { check: "cPanel", found: POLICIES.includes('cPanel') },
  { check: "Order URL", found: POLICIES.includes('hostnin.com') },
];
for (const c of checks) console.log(`  ${c.found ? '✅' : '❌'} ${c.check}`);

// 2. Print web hosting section (most common) - check specs
console.log('\n📊 WEB HOSTING (what AI sees):');
console.log(PRICING['Web Hosting']);

// 3. Check specs in all sections
console.log('\n📊 SPECS IN EACH SECTION:');
for (const [type, md] of Object.entries(PRICING)) {
  const hasSpecs = md.includes('GB') || md.includes('TB') || md.includes('Core') || md.includes('CPU');
  const lines = md.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| Plan')).length;
  const tokens = Math.round(md.length / 4);
  console.log(`  ${type.padEnd(25)} ${hasSpecs ? '✅ Has specs' : '❌ No specs'}  ${lines} plans  ~${tokens} tokens`);
}

// 4. Print a complex scenario: what does AI see for "Which cloud hosting plan should I get for my WooCommerce store?"
console.log('\n📊 SCENARIO: "What cloud hosting plan for WooCommerce store?"');
console.log('AI would see: CORE + POLICIES + Cloud Pricing + WooCommerce Pricing');
const scenarioContext = [POLICIES, PRICING['Cloud Hosting'], PRICING['WooCommerce Hosting']].join('\n\n');
console.log(`Total context: ~${Math.round(scenarioContext.length / 4)} tokens`);
console.log('\nCloud section preview:');
console.log(PRICING['Cloud Hosting'].substring(0, 400));
console.log('\nWooCommerce section preview:');
console.log(PRICING['WooCommerce Hosting'].substring(0, 400));

// 5. OLD vs NEW comparison (final)
console.log('\n📊 FINAL: OLD vs NEW token comparison');
const oldTokens = Math.round(JSON.stringify(knowledge).length / 4);
const scenarios = [
  { label: "Simple greeting", sections: [POLICIES] },
  { label: "Web hosting price", sections: [POLICIES, PRICING['Web Hosting']] },
  { label: "VPS inquiry", sections: [POLICIES, PRICING['VPS Hosting']] },
  { label: "Multi-intent (cloud+domain)", sections: [POLICIES, PRICING['Cloud Hosting']] },
];
for (const s of scenarios) {
  const tokens = Math.round(s.sections.join('\n\n').length / 4);
  const pct = Math.round((1 - tokens/oldTokens) * 100);
  console.log(`  ${s.label.padEnd(35)} ~${tokens} tokens (${pct}% reduction) vs old ${oldTokens}`);
}

console.log('\n' + '='.repeat(80));
