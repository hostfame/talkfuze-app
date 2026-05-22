const fs = require('fs');

const data = JSON.parse(fs.readFileSync('quick_replies_dump.json', 'utf8'));

// Filter and map to useful objects
const filtered = data
  .filter(r => r.content && r.content.trim().length > 5 && !r.content.includes('test test test'))
  .map(r => ({
    title: r.title || r.shortcut || 'Untitled',
    content: r.content.trim()
  }));

// Create a structured dictionary of replies
const structuredReplies = {};
for (const r of filtered) {
  if (!structuredReplies[r.title]) {
    structuredReplies[r.title] = r.content;
  }
}

const knowledgePath = '/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json';
const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

// Replace flat array with structured object
knowledge.canned_responses = structuredReplies;

fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2));
console.log(`Added ${Object.keys(structuredReplies).length} structured canned responses to knowledge base.`);
