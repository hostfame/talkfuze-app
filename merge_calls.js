const fs = require('fs');
const path = require('path');

// Parse .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...val] = line.split('=');
    if (key) {
      let value = val.join('=').trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      envVars[key.trim()] = value;
    }
  }
});

const url = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const headers = {
  'apikey': key,
  'Authorization': `Bearer ${key}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function fetchDb(endpoint, options = {}) {
  const res = await fetch(`${url}/rest/v1/${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchNoData(endpoint, options = {}) {
  const res = await fetch(`${url}/rest/v1/${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${await res.text()}`);
  }
}

async function run() {
  console.log("Fetching TalkFuze Agent logs with recordings...");
  
  const pbxLogs = await fetchDb(`call_logs?agent_name=eq.TalkFuze Agent&call_type=eq.pbx&recording_url=not.is.null&order=created_at.desc`);
  console.log(`Found ${pbxLogs.length} PBX logs to merge.`);
  
  let mergedCount = 0;
  let deletedCount = 0;

  for (const pbxLog of pbxLogs) {
    const cleanTo = pbxLog.to_number.replace(/\D/g, '').slice(-10);
    const cleanFrom = pbxLog.from_number.replace(/\D/g, '').slice(-10);
    
    const pbxTime = new Date(pbxLog.created_at).getTime();
    const fiveMinsBefore = new Date(pbxTime - 5 * 60 * 1000).toISOString();
    
    let matchEndpoint = `call_logs?org_id=eq.${pbxLog.org_id}&recording_url=is.null&created_at=gte.${encodeURIComponent(fiveMinsBefore)}&created_at=lte.${encodeURIComponent(pbxLog.created_at)}&id=neq.${pbxLog.id}&order=created_at.desc`;
    if (pbxLog.direction === 'outbound') {
      matchEndpoint += `&to_number=like.*${cleanTo}`;
    } else {
      matchEndpoint += `&from_number=like.*${cleanFrom}`;
    }

    try {
      const matches = await fetchDb(matchEndpoint);
      if (matches && matches.length > 0) {
        const originalLog = matches[0];
        console.log(`Merging PBX log ${pbxLog.id} into Original log ${originalLog.id}`);
        
        await fetchDb(`call_logs?id=eq.${originalLog.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            recording_url: pbxLog.recording_url,
            call_type: 'pbx',
            duration_seconds: pbxLog.duration_seconds,
            status: pbxLog.status
          })
        });
        mergedCount++;
        
        await fetchNoData(`call_logs?id=eq.${pbxLog.id}`, { method: 'DELETE' });
        deletedCount++;
      }
    } catch (e) {
      console.error(e);
    }
  }
  
  const emptyLogs = await fetchDb(`call_logs?agent_name=eq.TalkFuze Agent&recording_url=is.null&select=id`);
  if (emptyLogs && emptyLogs.length > 0) {
    console.log(`Found ${emptyLogs.length} empty PBX logs to delete.`);
    for (const log of emptyLogs) {
      await fetchNoData(`call_logs?id=eq.${log.id}`, { method: 'DELETE' });
    }
  }
  
  console.log(`Done! Merged ${mergedCount} recordings. Deleted ${deletedCount} duplicate rows.`);
}

run();
