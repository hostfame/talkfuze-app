import { create } from 'zustand';

export interface TeamMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
}

export interface TeamChat {
  id: string;
  org_id: string;
  type: 'direct' | 'group';
  name: string | null;
  other_member_name?: string;
  other_member_avatar?: string;
  members: { user_id: string; last_read_at: string }[];
}

interface TeamChatState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  chats: TeamChat[];
  setChats: (chats: TeamChat[]) => void;
  messages: Record<string, TeamMessage[]>;
  addMessage: (chatId: string, message: TeamMessage) => void;
  setMessages: (chatId: string, messages: TeamMessage[]) => void;
  unreadCounts: Record<string, number>;
  setUnreadCount: (chatId: string, count: number) => void;
  incrementUnreadCount: (chatId: string) => void;
}

export const useTeamChatStore = create<TeamChatState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  chats: [],
  setChats: (chats) => set({ chats }),
  messages: {},
  addMessage: (chatId, message) => set((state) => {
    const existing = state.messages[chatId] || [];
    // Exact ID match = skip duplicate
    if (existing.some(m => m.id === message.id)) return state;
    // If real message arrives and an optimistic version exists, replace it
    if (!message.id.startsWith('optimistic-')) {
      const optimisticIdx = existing.findIndex(
        m => m.id.startsWith('optimistic-') && m.content === message.content && m.sender_id === message.sender_id
      );
      if (optimisticIdx !== -1) {
        const updated = [...existing];
        updated[optimisticIdx] = message;
        return { messages: { ...state.messages, [chatId]: updated } };
      }
    }
    return {
      messages: { ...state.messages, [chatId]: [...existing, message] }
    };
  }),
  setMessages: (chatId, messages) => set((state) => ({
    messages: { ...state.messages, [chatId]: messages }
  })),
  unreadCounts: {},
  setUnreadCount: (chatId, count) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [chatId]: count }
  })),
  incrementUnreadCount: (chatId) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [chatId]: (state.unreadCounts[chatId] || 0) + 1 }
  }))
}));
