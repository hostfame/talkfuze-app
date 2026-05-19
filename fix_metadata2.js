const fs = require('fs');
let content = fs.readFileSync('src/components/inbox/ChatThread.tsx', 'utf-8');

content = content.replace(/msg\.metadata\.media_url/g, 'mediaUrl');
content = content.replace(/msg\.metadata\.url/g, 'mediaUrl');

fs.writeFileSync('src/components/inbox/ChatThread.tsx', content);
console.log('Fixed metadata parsing 2');
