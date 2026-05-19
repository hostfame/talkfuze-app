const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

const target = `      .on('broadcast', { event: 'typingStatus' }, (payload) => {`;
const replacement = `    const presenceChannel = supabase.channel(\`presence:\${org_id}\`)
    presenceChannel.on('presence', { event: 'sync' }, () => {})
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          user: deviceId,
          activeConversationId: activeConversationId || null,
          online_at: new Date().toISOString()
        })
      }
    })

    const typingChannel = supabase.channel(\`typing:\${org_id}\`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {`;

content = content.replace(target, replacement);

const unsubTarget = `      supabase.removeChannel(typingChannel)`;
const unsubReplacement = `      supabase.removeChannel(typingChannel)
      supabase.removeChannel(presenceChannel)`;

content = content.replace(unsubTarget, unsubReplacement);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log("Fixed Widget Presence");
