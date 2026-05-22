const data = require('./quick_replies_dump.json');
const uniqueReplies = Array.from(new Set(data.map(d => d.content))).filter(c => c && c.length > 5);

console.log("Total unique replies:", uniqueReplies.length);

const categories = {
  greetings: [],
  technical: [],
  sales: [],
  billing: [],
  other: []
};

uniqueReplies.forEach(r => {
  const lower = r.toLowerCase();
  if (lower.includes('welcome') || lower.includes('hello') || lower.includes('assalamu alaikum') || lower.includes('সালাম')) {
    categories.greetings.push(r);
  } else if (lower.includes('cpanel') || lower.includes('server') || lower.includes('dns') || lower.includes('ssl') || lower.includes('ip') || lower.includes('error')) {
    categories.technical.push(r);
  } else if (lower.includes('price') || lower.includes('buy') || lower.includes('plan') || lower.includes('offer') || lower.includes('discount')) {
    categories.sales.push(r);
  } else if (lower.includes('pay') || lower.includes('bkash') || lower.includes('invoice') || lower.includes('billing')) {
    categories.billing.push(r);
  } else {
    categories.other.push(r);
  }
});

console.log(`Greetings: ${categories.greetings.length}`);
console.log(`Technical: ${categories.technical.length}`);
console.log(`Sales: ${categories.sales.length}`);
console.log(`Billing: ${categories.billing.length}`);
console.log(`Other: ${categories.other.length}`);
