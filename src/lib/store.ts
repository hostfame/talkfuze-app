import { create } from 'zustand';

type MessageStore = {
  optimisticMessages: Record<string, any[]>
  addOptimisticMessage: (conversationId: string, message: any) => void
  removeOptimisticMessage: (conversationId: string, id: string) => void
  clearOptimisticMessages: (conversationId: string) => void
}

export const useMessageStore = create<MessageStore>((set) => ({
  optimisticMessages: {},
  addOptimisticMessage: (conversationId, message) => set((state) => ({
    optimisticMessages: {
      ...state.optimisticMessages,
      [conversationId]: [...(state.optimisticMessages[conversationId] || []), message]
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
  }))
}));
