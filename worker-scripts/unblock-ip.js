/**
 * IP Unblock Worker Endpoint
 * 
 * Runs on strack VPS, SSHs to all Hostnin hosting servers IN PARALLEL
 * to unblock an IP from CSF, CPGuard, and Fail2Ban.
 * 
 * ~3-5 seconds vs ~60-90 seconds through WHMCS bridge.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// All hosting servers with their SSH details
const SERVERS = [
  { name: 'Titan', host: 'titan.balancedserver.com', port: 2036 },
  { name: 'Nebula', host: 'nebula.balancedserver.com', port: 2036 },
  { name: 'Spark', host: 'spark.balancedserver.com', port: 2036 },
  { name: 'Apollo', host: 'apollo.balancedserver.com', port: 2036 },
  { name: 'Advance', host: 'advance.balancedserver.com', port: 2036 },
  { name: 'Velocity', host: 'velocity.balancedserver.com', port: 2036 },
  { name: 'Aurora', host: 'aurora.balancedserver.com', port: 2036 },
  { name: 'Flux', host: 'flux.balancedserver.com', port: 2036 },
  { name: 'Ignite', host: 'ignite.balancedserver.com', port: 2036 },
  { name: 'Rise', host: 'rise.balancedserver.com', port: 2036 },
];

// IP validation
function isValidIP(ip) {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4.test(ip)) return false;
  return ip.split('.').every(octet => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

// Unblock IP on a single server via SSH
async function unblockOnServer(server, ip) {
  const sshOpts = `-o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes -p ${server.port}`;
  
  // Build the remote command: try CSF, CPGuard, and Fail2Ban
  // Each command is independent - if one tool doesn't exist, it won't error
  // Append '; true' to force exit 0 (CSF returns non-zero when IP wasn't blocked)
  const remoteCmd = [
    `csf -dr ${ip} 2>/dev/null || true`,
    `csf -tr ${ip} 2>/dev/null || true`,
    `cpgcli ip --deny --remove ${ip} 2>/dev/null || true`,
    `cpgcli ip --temp-allow --remove ${ip} 2>/dev/null || true`,
    `cpgcli ip --allow ${ip} --reason 'TalkFuze unblock' 2>/dev/null || true`,
    `fail2ban-client unban ${ip} 2>/dev/null || true`,
    `echo DONE`,
  ].join('; ');

  const cmd = `ssh ${sshOpts} root@${server.host} "${remoteCmd}" 2>&1`;
  
  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 }); // 15s max per server
    const elapsed = Date.now() - startTime;
    return {
      server: server.name,
      status: 'success',
      elapsed: `${elapsed}ms`,
      output: (stdout || '').trim().substring(0, 200)
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    return {
      server: server.name,
      status: 'error',
      elapsed: `${elapsed}ms`,
      error: (err.stderr || err.message || '').substring(0, 200)
    };
  }
}

// Main unblock function - runs ALL servers in parallel
async function unblockIPOnAllServers(ip) {
  if (!isValidIP(ip)) {
    return { success: false, error: 'Invalid IP address' };
  }

  const startTime = Date.now();
  
  // Fire all SSH commands simultaneously
  const results = await Promise.all(
    SERVERS.map(server => unblockOnServer(server, ip))
  );

  const totalElapsed = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;

  return {
    success: true,
    ip,
    totalElapsed: `${totalElapsed}ms`,
    serversProcessed: `${successCount}/${SERVERS.length}`,
    details: results
  };
}

// Express route handler
function registerUnblockRoute(app) {
  // Shared secret for auth (set in .env)
  const WORKER_API_SECRET = process.env.WORKER_API_SECRET || '';

  app.post('/api/unblock-ip', async (req, res) => {
    // Auth check
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    
    if (!WORKER_API_SECRET || token !== WORKER_API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, error: 'IP address required' });
    }

    console.log(`[UNBLOCK] Starting unblock for IP: ${ip}`);
    const result = await unblockIPOnAllServers(ip);
    console.log(`[UNBLOCK] Completed: ${result.totalElapsed} - ${result.serversProcessed} servers`);
    
    res.json(result);
  });

  // Also support GET for quick checks
  app.get('/api/check-ip/:ip', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    
    if (!WORKER_API_SECRET || token !== WORKER_API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { ip } = req.params;
    if (!ip || !isValidIP(ip)) {
      return res.status(400).json({ success: false, error: 'Invalid IP' });
    }

    // Check if IP is blocked on any server
    const sshOpts = `-o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes`;
    const results = await Promise.all(
      SERVERS.map(async (server) => {
        try {
          const cmd = `ssh ${sshOpts} -p ${server.port} root@${server.host} 'csf -g ${ip} 2>/dev/null | grep -c "^${ip}" || echo 0; cpgcli ip --check ${ip} 2>/dev/null || echo "no cpguard"' 2>&1`;
          const { stdout } = await execAsync(cmd, { timeout: 10000 });
          return { server: server.name, output: (stdout || '').trim().substring(0, 300) };
        } catch (err) {
          return { server: server.name, error: (err.message || '').substring(0, 100) };
        }
      })
    );

    res.json({ ip, results });
  });
}

module.exports = { registerUnblockRoute, unblockIPOnAllServers };
