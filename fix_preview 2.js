const fs = require('fs');

// 1. Update dashboard.ts
let dashboard = fs.readFileSync('src/actions/dashboard.ts', 'utf-8');
dashboard = dashboard.replace('messages(content, sender_type)', 'messages(content, sender_type, content_type)');
fs.writeFileSync('src/actions/dashboard.ts', dashboard);

// 2. Update types.ts
let types = fs.readFileSync('src/lib/types.ts', 'utf-8');
types = types.replace("Pick<AppMessage, 'content' | 'sender_type'>", "Pick<AppMessage, 'content' | 'sender_type' | 'content_type'>");
fs.writeFileSync('src/lib/types.ts', types);

// 3. Update ConversationList.tsx
let clist = fs.readFileSync('src/components/inbox/ConversationList.tsx', 'utf-8');
clist = clist.replace(
  "lastMessage.content === '[Attachment]' ?",
  "lastMessage.content_type === 'image' ? (\n                            <><ImageIcon size={14} className=\"text-blue-500 shrink-0\" /> Photo</>\n                          ) : lastMessage.content_type === 'video' ? (\n                            <><Video size={14} className=\"text-blue-500 shrink-0\" /> Video</>\n                          ) : lastMessage.content_type === 'audio' ? (\n                            <><Mic size={14} className=\"text-blue-500 shrink-0\" /> Voice message</>\n                          ) : lastMessage.content_type === 'file' || lastMessage.content === '[Attachment]' ?"
);
// Also remove the old hardcoded ones from ConversationList.tsx
clist = clist.replace(/lastMessage\.content === '\[Audio Voice Message\]' \? \(\s*<><Mic size=\{14\} className="text-blue-500 shrink-0" \/> Voice message<\/>\s*\) : /g, '');
clist = clist.replace(/lastMessage\.content === '\[Image\]' \? \(\s*<><ImageIcon size=\{14\} className="text-blue-500 shrink-0" \/> Photo<\/>\s*\) : /g, '');
clist = clist.replace(/lastMessage\.content === '\[Video\]' \? \(\s*<><Video size=\{14\} className="text-blue-500 shrink-0" \/> Video<\/>\s*\) : /g, '');

fs.writeFileSync('src/components/inbox/ConversationList.tsx', clist);

console.log('Fixed preview content_type fetching and rendering');
