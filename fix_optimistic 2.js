const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

const target = `            if (newMsg.sender_type !== 'contact') {
                playUISound('receive');
            }
            return [...prev, newMsg as WidgetMessage];`;

const replacement = `            if (newMsg.sender_type !== 'contact') {
                playUISound('receive');
            }
            
            if (newMsg.sender_type === 'contact') {
              const tempIndex = prev.findIndex(m => m.id.startsWith('temp-') && m.content === newMsg.content);
              if (tempIndex !== -1) {
                const next = [...prev];
                next[tempIndex] = newMsg as WidgetMessage;
                return next;
              }
            }
            
            return [...prev, newMsg as WidgetMessage];`;

content = content.replace(target, replacement);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log("Fixed optimistic duplication");
