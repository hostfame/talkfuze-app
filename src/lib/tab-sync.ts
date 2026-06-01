/**
 * tab-sync.ts
 * Cross-tab synchronization using the native BroadcastChannel API.
 *
 * Purpose: When Agent A picks up a chat in Tab 1, Tab 2 (same browser) stops
 * ringing instantly - no network round-trip, pure in-memory message passing.
 *
 * Supabase Realtime sends one message per CLIENT (browser instance), not per tab.
 * This fills that gap.
 */

const CHANNEL_NAME = 'talkfuze-inbox';

export type TabSyncEvent =
  | { type: 'conversationJoined'; conversation_id: string; user_id: string; user_name?: string }
  | { type: 'conversationLeft'; conversation_id: string; user_id: string }
  | { type: 'typingStatus'; payload: any };

let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!('BroadcastChannel' in window)) return null;
  if (!_channel) {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return _channel;
}

/**
 * Post an event to all other tabs in the same browser.
 * Fire-and-forget. Does not throw.
 */
export function postTabSync(event: TabSyncEvent): void {
  try {
    getChannel()?.postMessage(event);
  } catch (err) {
    // Non-fatal - Supabase broadcast is primary signal
  }
}

/**
 * Subscribe to events posted by other tabs.
 * Returns a cleanup function - call it on component unmount.
 */
export function subscribeTabSync(handler: (event: TabSyncEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (e: MessageEvent<TabSyncEvent>) => {
    if (e.data && e.data.type) {
      handler(e.data);
    }
  };

  ch.addEventListener('message', listener);

  return () => {
    ch.removeEventListener('message', listener);
  };
}
