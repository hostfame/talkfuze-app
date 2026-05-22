const fs = require('fs');
const data = JSON.parse(fs.readFileSync('quick_replies_dump.json', 'utf8'));

console.log("Total replies:", data.length);
console.log("Keys:", Object.keys(data[0]));

const uniqueBodies = Array.from(new Set(data.map(d => d.body || d.content || d.text || "")));
console.log("Unique content count:", uniqueBodies.length);

const snippets = uniqueBodies.filter(body => body.length > 20).slice(0, 15);
snippets.forEach((s, i) => console.log(`[${i+1}] ${s.substring(0, 80)}...`));

