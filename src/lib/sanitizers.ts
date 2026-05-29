import { AppMessage } from '@/lib/store';

/**
 * Enterprise-grade data layer sanitizer for incoming real-time Messages.
 * Guarantees that any malformed, null, or unexpected data types are safely
 * coerced into standard formats to prevent UI rendering crashes (e.g., TypeError on .map or .toLowerCase).
 */
export function normalizeMessage(raw: any): AppMessage | null {
  if (!raw) return null;
  if (!raw.id) return null; // Critical failure, ignore message

  // Fix timezone issue from Supabase Realtime (missing Z causes sorting bugs)
  let safeCreatedAt = raw.created_at || new Date().toISOString();
  if (typeof safeCreatedAt === 'string' && !safeCreatedAt.endsWith('Z') && !safeCreatedAt.includes('+')) {
    safeCreatedAt += 'Z';
  }

  // Parse metadata safely into an object once, preventing repeated try/catches in UI
  let safeMeta = {};
  if (typeof raw.metadata === 'string') {
    try {
      safeMeta = JSON.parse(raw.metadata);
    } catch (e) {
      safeMeta = {};
    }
  } else if (raw.metadata && typeof raw.metadata === 'object') {
    safeMeta = raw.metadata;
  }

  return {
    ...raw,
    id: String(raw.id),
    conversation_id: String(raw.conversation_id || ''),
    content: typeof raw.content === 'string' ? raw.content : "",
    content_type: typeof raw.content_type === 'string' ? raw.content_type : "text",
    sender_type: typeof raw.sender_type === 'string' ? raw.sender_type : "system",
    sender_id: raw.sender_id ? String(raw.sender_id) : null,
    status: typeof raw.status === 'string' ? raw.status : "delivered",
    created_at: safeCreatedAt,
    metadata: safeMeta, // Normalized to object
    is_internal: !!raw.is_internal,
  };
}

/**
 * Enterprise-grade data layer sanitizer for incoming real-time Conversations.
 */
export function normalizeConversation(raw: any): any {
  if (!raw) return null;
  if (!raw.id) return null;

  let safeCreatedAt = raw.created_at || new Date().toISOString();
  if (typeof safeCreatedAt === 'string' && !safeCreatedAt.endsWith('Z') && !safeCreatedAt.includes('+')) {
    safeCreatedAt += 'Z';
  }

  let safeUpdatedAt = raw.updated_at || safeCreatedAt;
  if (typeof safeUpdatedAt === 'string' && !safeUpdatedAt.endsWith('Z') && !safeUpdatedAt.includes('+')) {
    safeUpdatedAt += 'Z';
  }

  // Ensure arrays are strictly arrays
  const safeTags = Array.isArray(raw.tags) ? raw.tags : (typeof raw.tags === 'string' ? [raw.tags] : []);
  const safeParticipants = Array.isArray(raw.participants) ? raw.participants : [];
  
  // Safely parse metadata
  let safeMeta = {};
  if (typeof raw.metadata === 'string') {
    try { safeMeta = JSON.parse(raw.metadata); } catch (e) {}
  } else if (raw.metadata && typeof raw.metadata === 'object') {
    safeMeta = raw.metadata;
  }

  return {
    ...raw,
    id: String(raw.id),
    org_id: String(raw.org_id || ''),
    status: typeof raw.status === 'string' ? raw.status : "open",
    tags: safeTags,
    participants: safeParticipants,
    created_at: safeCreatedAt,
    updated_at: safeUpdatedAt,
    metadata: safeMeta,
    is_unread: !!raw.is_unread,
    is_archived: !!raw.is_archived,
    is_pinned: !!raw.is_pinned,
    is_muted: !!raw.is_muted,
  };
}
