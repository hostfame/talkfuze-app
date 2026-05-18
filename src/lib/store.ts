import { create } from 'zustand';
import type { AppMessage, ConversationWithDetails, UserProfile } from './types';

export type OptimisticMessage = {
  id: string;
  sender_type: 'agent';
  sender_id?: string | null;
  content: string | null;
  content_type?: string | null;
  metadata?: Record<string, unknown> | null;
  is_internal?: boolean | null;
  status: 'sending' | 'failed';
  created_at: string;
  [key: string]: unknown;
}

type MessageStore = {
  optimisticMessages: Record<string, OptimisticMessage[]>
  addOptimisticMessage: (conversationId: string, message: OptimisticMessage) => void
  markFailed: (conversationId: string, id: string) => void
  removeOptimisticMessage: (conversationId: string, id: string) => void
  clearOptimisticMessages: (conversationId: string) => void
  confirmOptimisticMessage: (conversationId: string, content: string) => void
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
        m.id === id ? { ...m, status: 'failed' } : m
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

  // When a real message arrives, remove the first pending optimistic with matching content
  confirmOptimisticMessage: (conversationId, content) => set((state) => {
    const msgs = state.optimisticMessages[conversationId] || [];
    const idx = msgs.findIndex(m => m.status === 'sending' && m.content === content);
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
  activeFilter: 'mine' | 'all' | 'unassigned' | 'mentions'
  currentUser: UserProfile | null
  messagesMap: Record<string, AppMessage[]>
  setConversations: (conversations: ConversationWithDetails[]) => void
  setTeamMembers: (members: UserProfile[]) => void
  setSelectedId: (id: string | null) => void
  setActiveFilter: (filter: 'mine' | 'all' | 'unassigned' | 'mentions') => void
  setCurrentUser: (user: UserProfile | null) => void
  setMessages: (convoId: string, messages: AppMessage[]) => void
  addMessage: (convoId: string, message: AppMessage) => void
  updateConversation: (id: string, payload: Partial<ConversationWithDetails>) => void
}

export const useInboxStore = create<InboxState>((set) => ({
  conversations: [],
  teamMembers: [],
  isLoaded: false,
  selectedId: null,
  activeFilter: 'all',
  currentUser: null,
  messagesMap: {},
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
  }))
}))
