const fs = require('fs');
const knowledge = JSON.parse(fs.readFileSync('/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json', 'utf8'));

let md = `# Hostnin AI Knowledge Base\n\n`;
md += `> This document outlines everything the TalkFuze AI knows about Hostnin. Review this to identify any outdated information.\n\n`;

md += `## 1. Hosting Plans & Pricing\n\n`;

// Group plans by type
const plansByType = {};
knowledge.plans.forEach(p => {
  if (!plansByType[p.type]) plansByType[p.type] = [];
  plansByType[p.type].push(p);
});

for (const [type, plans] of Object.entries(plansByType)) {
  md += `### ${type}\n\n`;
  md += `| Name | Period | Price | Specs |\n`;
  md += `|---|---|---|---|\n`;
  plans.forEach(p => {
    const specs = (p.server || []).join(', ');
    md += `| ${p.name} | ${p.period} | ${p.currency}${p.price} | ${specs} |\n`;
  });
  md += `\n`;
}

md += `## 2. Domains\n\n`;
md += `| TLD | Price | Period |\n`;
md += `|---|---|---|\n`;
knowledge.domains.forEach(d => {
  md += `| ${d.tld} | ${d.currency}${d.price} | ${d.period} |\n`;
});
md += `\n`;

md += `## 3. Policies & Contact\n\n`;
md += `**Terms Summary:**\n${knowledge.policies.terms_summary}\n\n`;
md += `**Prohibited Content:**\n${knowledge.policies.prohibited}\n\n`;
md += `**Refund Policy:**\n${knowledge.policies.refund}\n\n`;
md += `**Affiliate Policy:**\n${knowledge.policies.affiliate}\n\n`;
md += `**Payment Failure Protocol:**\n${knowledge.policies.payment_failure_protocol}\n\n`;
if (knowledge.policies.vps_info) md += `**VPS Policy:**\n${knowledge.policies.vps_info}\n\n`;
if (knowledge.policies.dedicated_info) md += `**Dedicated Server Policy:**\n${knowledge.policies.dedicated_info}\n\n`;

md += `**Contact Info:**\n`;
md += `- **WhatsApp:** ${knowledge.contact.whatsapp}\n`;
md += `- **Email:** ${knowledge.contact.email}\n`;
md += `- **Website:** ${knowledge.contact.website}\n`;
md += `- **Bank:** ${knowledge.contact.payment_bank}\n\n`;

md += `## 4. Comparisons & Recommendations\n\n`;
knowledge.comparisons.forEach(c => {
  md += `- ${c.replace(/\n/g, ' ')}\n`;
});
md += `\n`;

md += `## 5. Canned Responses (Quick Replies)\n\n`;
md += `| Title / Intent | Exact Response |\n`;
md += `|---|---|\n`;
for (const [title, content] of Object.entries(knowledge.canned_responses)) {
  // Replace newlines with <br> for table rendering
  const safeContent = content.replace(/\n/g, '<br>').replace(/\|/g, '\\|');
  const safeTitle = title.replace(/\n/g, ' ').replace(/\|/g, '\\|');
  md += `| **${safeTitle}** | ${safeContent} |\n`;
}
md += `\n`;

fs.writeFileSync('hostnin_knowledge_base.md', md);
console.log('Artifact generated.');
