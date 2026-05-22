"use server"

/**
 * Direct SSH-based IP unblocking via strack worker.
 * Hits all 10 servers in parallel via SSH - ~3-5 seconds total.
 * Falls back to WHMCS bridge if worker is unreachable.
 */

const WORKER_URL = process.env.WORKER_API_URL || 'http://46.225.152.127:3001';
const WORKER_SECRET = process.env.WORKER_API_SECRET || '';

export async function unblockIPFast(ip: string) {
  const cleanIP = ip.trim();
  
  // Basic validation
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4.test(cleanIP)) {
    return { result: 'error', message: 'Invalid IP address format' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s max

    const response = await fetch(`${WORKER_URL}/api/unblock-ip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify({ ip: cleanIP }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return { result: 'error', message: `Worker error: ${response.status} - ${text}` };
    }

    const data = await response.json();
    
    return {
      result: 'success',
      message: `Unblocked on ${data.serversProcessed} servers in ${data.totalElapsed}`,
      details: data.details,
      totalElapsed: data.totalElapsed,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { result: 'error', message: 'Worker request timed out after 20s' };
    }
    console.error('[unblockIPFast] Worker unreachable:', err.message);
    return { result: 'error', message: `Worker unreachable: ${err.message}` };
  }
}
