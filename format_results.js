const fs = require('fs');

const data = JSON.parse(fs.readFileSync('test_results.json', 'utf8'));

let md = '# AI Draft Engine - 20 Batch Test Results\n\n';
md += 'Testing the new pattern-based Tech-Banglish glossary and dynamic escalation logic.\n\n';

data.forEach((t) => {
  md += `### Test ${t.id}: ${t.type} (${t.lang})\n`;
  md += `**Customer:** ${t.customer_msg}\n`;
  md += `**Agent Instruction:** ${t.instruction}\n`;
  md += `**Expected Patterns:** ${t.expected_features}\n\n`;
  
  md += `**AI Response:**\n`;
  md += `> ${t.ai_response.replace(/\n/g, '\n> ')}\n\n`;
  md += `---\n`;
});

fs.writeFileSync('/Users/imran/.gemini/antigravity/brain/9da5cba4-68b8-44f1-a3f5-163994f2183a/ai_test_results.md', md);
console.log('Artifact created.');
