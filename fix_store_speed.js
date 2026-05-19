const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/inbox/page.tsx', 'utf-8');

const target = `           setConversations((prev) => {
              const next = [...(prev || [])];
              const convIndex = next.findIndex(c => c.id === newMsg.conversation_id);
              if (convIndex !== -1) {
                 const conv = { ...next[convIndex] };
                 conv.last_message_at = newMsg.created_at;
                 // Add latestMessage array mock if it doesn't exist
                 conv.latestMessage = [newMsg];
                 // Move to top
                 next.splice(convIndex, 1);
                 next.unshift(conv);
                 return next;
              } else {
                 // It's a brand new conversation, fetch it quietly
                 const currentFilter = useInboxStore.getState().activeFilter as any;
                 getConversations(ORG_ID, currentFilter).then(data => setConversations((data || []) as ConversationWithDetails[]));
                 return prev;
              }
           });`;

const replacement = `           const prev = useInboxStore.getState().conversations || [];
           const next = [...prev];
           const convIndex = next.findIndex(c => c.id === newMsg.conversation_id);
           if (convIndex !== -1) {
              const conv = { ...next[convIndex] };
              conv.last_message_at = newMsg.created_at;
              // Add latestMessage array mock if it doesn't exist
              conv.latestMessage = [newMsg] as any;
              // Move to top
              next.splice(convIndex, 1);
              next.unshift(conv);
              setConversations(next as any);
           } else {
              // It's a brand new conversation, fetch it quietly
              const currentFilter = useInboxStore.getState().activeFilter as any;
              getConversations(ORG_ID, currentFilter).then(data => setConversations((data || []) as any));
           }`;

content = content.replace(target, replacement);

fs.writeFileSync('src/app/(dashboard)/inbox/page.tsx', content);
console.log("Fixed store typing");
