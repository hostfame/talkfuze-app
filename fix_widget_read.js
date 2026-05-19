const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

const target = `  useEffect(() => {
    fetchMsgs()
  }, [activeConversationId, deviceId, org_id])`;

const replacement = `  useEffect(() => {
    fetchMsgs()
  }, [activeConversationId, deviceId, org_id])

  useEffect(() => {
    if (activeTab === 'chat' && activeConversationId && activeConversationId !== 'new') {
      markMessagesAsRead(activeConversationId, 'contact');
    }
  }, [activeTab, activeConversationId, messages])`;

content = content.replace(target, replacement);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log("Fixed widget read receipts");
