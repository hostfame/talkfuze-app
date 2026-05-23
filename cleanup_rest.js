const https = require('https');
require('dotenv').config({ path: '.env.local' });

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', ''),
      port: 443,
      path: path,
      method: method,
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { 
        if (data && data.length > 0) resolve(JSON.parse(data));
        else resolve(null);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const msgs = await request('GET', '/rest/v1/messages?content=ilike.*voice%20call*&order=created_at.desc&limit=2000');
  if (!msgs) return;

  const toDelete = [];
  const convMap = {};

  for (const msg of msgs) {
    if (!convMap[msg.conversation_id]) convMap[msg.conversation_id] = [];
    convMap[msg.conversation_id].push(msg);
  }

  for (const convId in convMap) {
    const list = convMap[convId];
    let currentGroup = [];
    for (const msg of list) {
      if (currentGroup.length === 0) {
        currentGroup.push(msg);
      } else {
        const timeDiff = Math.abs(new Date(currentGroup[0].created_at).getTime() - new Date(msg.created_at).getTime());
        if (timeDiff < 30000) {
          currentGroup.push(msg);
        } else {
          processGroup(currentGroup, toDelete);
          currentGroup = [msg];
        }
      }
    }
    if (currentGroup.length > 0) processGroup(currentGroup, toDelete);
  }

  function processGroup(group, deleteList) {
    if (group.length <= 1) return;
    let hasAnswered = false;
    let answeredId = null;

    for (const m of group) {
      let meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      if (meta.status === 'ANSWERED' || (meta.duration && meta.duration !== '0s' && meta.duration !== '0:00')) {
        hasAnswered = true;
        answeredId = m.id;
        break;
      }
    }

    if (hasAnswered) {
      for (const m of group) {
        if (m.id !== answeredId) deleteList.push(m.id);
      }
    } else {
      for (let i = 1; i < group.length; i++) {
        deleteList.push(group[i].id);
      }
    }
  }

  console.log('Found', toDelete.length, 'duplicates to delete');
  for (const id of toDelete) {
    await request('DELETE', `/rest/v1/messages?id=eq.${id}`);
  }
  console.log('Cleanup complete');
}
run();
