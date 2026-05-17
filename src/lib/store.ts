import { create } from 'zustand';

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
