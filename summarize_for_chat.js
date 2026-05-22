const fs = require('fs');
const k = JSON.parse(fs.readFileSync('/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json', 'utf8'));

console.log("### 🖥️ Hosting Plans & Pricing");
const types = [...new Set(k.plans.map(p => p.type))];
types.forEach(t => {
  const plans = k.plans.filter(p => p.type === t);
  console.log(`\n**${t}**`);
  plans.forEach(p => {
    console.log(`- ${p.name}: ${p.currency}${p.price}/${p.period}`);
  });
});

console.log("\n### 🌐 Domains");
k.domains.forEach(d => {
  console.log(`- ${d.tld}: ${d.currency}${d.price}/${d.period}`);
});

console.log("\n### 📜 Policies (Summary)");
console.log("- **Refunds:**", k.policies.refund);
console.log("- **Prohibited:**", k.policies.prohibited);
console.log("- **VPS/Dedicated:**", k.policies.vps_info || "VPS is self-managed...", k.policies.dedicated_info || "Dedicated servers...");

console.log("\n### 💬 Quick Replies (137 Total)");
const titles = Object.keys(k.canned_responses);
console.log(`AI knows 137 exact responses for things like:`);
console.log(titles.slice(0, 15).map(t => `- ${t}`).join('\n'));
console.log(`- ...and ${titles.length - 15} more.`);
