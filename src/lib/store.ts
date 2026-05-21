import { create } from 'zustand';
import type { AppMessage, ConversationWithDetails, UserProfile } from './types';

export type OptimisticMessage = {
  id: string;
  sender_type: string;
  sender_id?: string | null;
  content: string | null;
  content_type?: string | null;
  metadata?: Record<string, unknown> | null;
  is_internal?: boolean | null;
  status: 'sending' | 'failed' | 'confirmed';
  created_at: string;
  _confirmedAt?: number; // timestamp when confirmed, for stale cleanup
  [key: string]: unknown;
}

type MessageStore = {
  optimisticMessages: Record<string, OptimisticMessage[]>
  addOptimisticMessage: (conversationId: string, message: OptimisticMessage) => void
  markFailed: (conversationId: string, id: string) => void
  markConfirmed: (conversationId: string, id: string) => void
  removeOptimisticMessage: (conversationId: string, id: string) => void
  clearOptimisticMessages: (conversationId: string) => void
  confirmOptimisticMessage: (conversationId: string, content: string) => void
  drainConfirmedForContent: (conversationId: string, content: string) => void
}

export const useMessageStore = create<MessageStore>((set) => ({
  optimisticMessages: {},

  addOptimisticMessage: (conversationId, message) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: [...(state.optimisticMessages[conversationId] || []), message]
    }
  })),

  markFailed: (conversationId, id) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: (state.optimisticMessages[conversationId] || []).map(m =>
        m.id === id ? { ...m, status: 'failed' as const } : m
      )
    }
  })),

  // Mark as confirmed (API succeeded) but KEEP in list until real-time INSERT drains it
  markConfirmed: (conversationId, id) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: (state.optimisticMessages[conversationId] || []).map(m =>
        m.id === id ? { ...m, status: 'confirmed' as const, _confirmedAt: Date.now() } : m
      )
    }
  })),

  removeOptimisticMessage: (conversationId, id) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: (state.optimisticMessages[conversationId] || []).filter(m => m.id !== id)
    }
  })),

  clearOptimisticMessages: (conversationId) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: []
    }
  })),

  // When a real message arrives via real-time, remove the first confirmed optimistic with matching content
  confirmOptimisticMessage: (conversationId, content) => set((state) => {
    const msgs = state.optimisticMessages[conversationId] || [];
    // First try to drain a 'confirmed' one (preferred - API already succeeded)
    let idx = msgs.findIndex(m => m.status === 'confirmed' && m.content === content);
    // Fallback: drain a 'sending' one (real-time arrived before API response)
    if (idx === -1) idx = msgs.findIndex(m => m.status === 'sending' && m.content === content);
    if (idx === -1) return state;
    const updated = [...msgs];
    updated.splice(idx, 1);
    return {
      optimisticMessages: {
        ...state.optimisticMessages,
        [conversationId]: updated
      }
    };
  }),

  // Drain a confirmed optimistic by content match (called when real-time INSERT arrives)
  drainConfirmedForContent: (conversationId, content) => set((state) => {
    const msgs = state.optimisticMessages[conversationId] || [];
    const idx = msgs.findIndex(m => (m.status === 'confirmed' || m.status === 'sending') && m.content === content);
    if (idx === -1) return state;
    const updated = [...msgs];
    updated.splice(idx, 1);
    return {
      optimisticMessages: {
        ...state.optimisticMessages,
        [conversationId]: updated
      }
    };
  }),
}));

interface InboxState {
  conversations: ConversationWithDetails[]
  teamMembers: UserProfile[]
  isLoaded: boolean
  selectedId: string | null
  activeFilter: 'mine' | 'all' | 'unassigned' | 'mentions' | 'messenger' | 'whatsapp' | 'instagram' | 'pinned' | 'calls' | 'archived' | 'alerts'
  currentUser: UserProfile | null
  messagesMap: Record<string, AppMessage[]>
  pendingDialNumber: string | null
  pendingIncomingCall: { conversationId: string; offer: any; callerName?: string } | null
  mobileView: 'list' | 'chat'
  convertingTickets: Record<string, boolean>
  setConversations: (conversations: ConversationWithDetails[]) => void
  setTeamMembers: (members: UserProfile[]) => void
  setSelectedId: (id: string | null) => void
  setActiveFilter: (filter: 'mine' | 'all' | 'unassigned' | 'mentions' | 'messenger' | 'whatsapp' | 'instagram' | 'pinned' | 'calls' | 'archived' | 'alerts') => void
  setCurrentUser: (user: UserProfile | null) => void
  setMessages: (convoId: string, messages: AppMessage[]) => void
  addMessage: (convoId: string, message: AppMessage) => void
  updateConversation: (id: string, payload: Partial<ConversationWithDetails>) => void
  removeConversation: (id: string) => void
  triggerDial: (number: string) => void
  clearPendingDial: () => void
  setPendingIncomingCall: (call: { conversationId: string; offer: any; callerName?: string } | null) => void
  setMobileView: (view: 'list' | 'chat') => void
  setConvertingTicket: (id: string, converting: boolean) => void
}

export const useInboxStore = create<InboxState>((set) => ({
  conversations: [],
  teamMembers: [],
  isLoaded: false,
  selectedId: null,
  activeFilter: 'all',
  currentUser: null,
  messagesMap: {},
  pendingDialNumber: null,
  pendingIncomingCall: null,
  mobileView: 'list',
  convertingTickets: {},
  setConversations: (conversations) => set({ conversations, isLoaded: true }),
  setTeamMembers: (teamMembers) => set({ teamMembers }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setCurrentUser: (currentUser) => set({ currentUser }),
  setMessages: (convoId, messages) => set((state) => ({
    messagesMap: { ...state.messagesMap, [convoId]: messages }
  })),
  addMessage: (convoId, message) => set((state) => {
    const existing = state.messagesMap[convoId] || []
    if (existing.some(m => m.id === message.id)) return state
    return {
      messagesMap: { ...state.messagesMap, [convoId]: [...existing, message] }
    }
  }),
  updateConversation: (id, payload) => set((state) => ({
    conversations: state.conversations.map((c) => 
      c.id === id ? { ...c, ...payload } : c
    )
  })),
  removeConversation: (id) => set((state) => ({
    conversations: state.conversations.filter((c) => c.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId
  })),
  triggerDial: (number) => set({ pendingDialNumber: number }),
  clearPendingDial: () => set({ pendingDialNumber: null }),
  setPendingIncomingCall: (pendingIncomingCall) => set({ pendingIncomingCall }),
  setMobileView: (mobileView) => set({ mobileView }),
  setConvertingTicket: (id, converting) => set((state) => ({
    convertingTickets: { ...state.convertingTickets, [id]: converting }
  }))
}))

