const fs = require('fs');

let content = fs.readFileSync('src/components/inbox/ChatThread.tsx', 'utf-8');

// Step 1: Inject the safeMeta definition at the start of the map
const mapStart = `        {allMessages.map((msg, idx) => {`;
const mapReplacement = `        {allMessages.map((msg, idx) => {
          const safeMeta = typeof msg.metadata === 'string' 
            ? (() => { try { return JSON.parse(msg.metadata) } catch(e) { return {} } })() 
            : (msg.metadata || {});
          
          const mediaUrl = (safeMeta.media_url || safeMeta.url) as string;`;

content = content.replace(mapStart, mapReplacement);

// Step 2: Replace usages
content = content.replace(/msg\.metadata\?\.media_url \|\| msg\.metadata\?\.url/g, 'mediaUrl');
content = content.replace(/msg\.metadata\?\.media_url/g, 'mediaUrl');
content = content.replace(/msg\.metadata\?\.url/g, 'mediaUrl');

content = content.replace(/msg\.metadata\?\.filename/g, 'safeMeta.filename');
content = content.replace(/msg\.metadata\.filename/g, 'safeMeta.filename');

content = content.replace(/msg\.metadata\?\.mimetype/g, 'safeMeta.mimetype');
content = content.replace(/msg\.metadata\.mimetype/g, 'safeMeta.mimetype');

content = content.replace(/msg\.metadata\?\.participant_name/g, 'safeMeta.participant_name');
content = content.replace(/msg\.metadata\.participant_name/g, 'safeMeta.participant_name');

content = content.replace(/\(msg\.metadata as any\)\?\.reply_to/g, 'safeMeta.reply_to');

// Let's also ensure anything like `msg.metadata?.media_url ?? null` becomes `mediaUrl ?? null`
content = content.replace(/msg\.metadata\?\?.media_url/g, 'mediaUrl');

fs.writeFileSync('src/components/inbox/ChatThread.tsx', content);
console.log('Fixed metadata parsing');
