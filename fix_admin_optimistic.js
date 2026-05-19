const fs = require('fs');

let content = fs.readFileSync('src/components/inbox/ChatThread.tsx', 'utf-8');

// Change crypto.randomUUID() to "temp-" + crypto.randomUUID()
content = content.replace(/const tempId = crypto.randomUUID\(\)/g, 'const tempId = "temp-" + crypto.randomUUID()');

// Deduplicate displayMessages
const target = `  const displayMessages = [...(messages || []), ...optimisticMessages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())`;
const replacement = `  const displayMessages = [...(messages || []), ...optimisticMessages]
    .filter((msg, index, self) => {
      // If this is an optimistic message, ensure no REAL message has identical content and sender
      if (msg.id.startsWith('temp-')) {
         return !self.some(m => !m.id.startsWith('temp-') && m.content === msg.content && m.sender_type === msg.sender_type);
      }
      return true;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/inbox/ChatThread.tsx', content);
console.log("Fixed Admin Inbox duplication");
