const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/inbox/page.tsx', 'utf-8');

const target = `      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        // Refresh conversation list so last message preview updates
        const currentFilter = useInboxStore.getState().activeFilter as any
        getConversations(ORG_ID, currentFilter).then(data => setConversations((data || []) as ConversationWithDetails[]))
        
        // Play sound if the message is from a contact
        if (payload.new && payload.new.sender_type === 'contact') {
           playUISound('receive')
        }
      })`;

const replacement = `      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as any;
        
        // Update conversation list locally instead of re-fetching everything
        if (newMsg && newMsg.conversation_id) {
           setConversations((prev) => {
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
           });
        }
        
        // Play sound if the message is from a contact
        if (newMsg && newMsg.sender_type === 'contact') {
           playUISound('receive')
        }
      })`;

content = content.replace(target, replacement);

fs.writeFileSync('src/app/(dashboard)/inbox/page.tsx', content);
console.log("Fixed inbox slow update speed");
