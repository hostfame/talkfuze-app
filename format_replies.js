const fs = require('fs');

const data = JSON.parse(fs.readFileSync('quick_replies_dump.json', 'utf8'));

// Filter and map to useful objects
const filtered = data
  .filter(r => r.content && r.content.trim().length > 5 && !r.content.includes('test test test'))
  .map(r => ({
    title: r.title || r.shortcut,
    content: r.content.trim()
  }));

// Remove exact duplicates
const uniqueContents = new Set();
const finalReplies = [];
for (const r of filtered) {
  if (!uniqueContents.has(r.content)) {
    uniqueContents.add(r.content);
    finalReplies.push(r);
  }
}

const knowledgePath = '/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json';
const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

knowledge.canned_responses = finalReplies.map(r => r.content);

fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2));
console.log(`Added ${finalReplies.length} unique canned responses to knowledge base.`);
