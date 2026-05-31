import { create } from 'zustand';

export interface TeamMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
  attachment_url?: string;
  attachment_type?: 'image' | 'audio';
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
    // 1. Exact ID match = skip
    if (existing.some(m => m.id === message.id)) return state;
    
    // Parse attachments if coming directly from realtime (not yet parsed)
    let parsedMsg = { ...message };
    if (!parsedMsg.attachment_url && parsedMsg.content) {
      if (parsedMsg.content.startsWith('[IMAGE]')) {
        parsedMsg.attachment_type = 'image';
        parsedMsg.attachment_url = parsedMsg.content.substring(7);
        parsedMsg.content = 'Sent an image';
      } else if (parsedMsg.content.startsWith('[AUDIO]')) {
        parsedMsg.attachment_type = 'audio';
        parsedMsg.attachment_url = parsedMsg.content.substring(7);
        parsedMsg.content = 'Sent a voice message';
      }
    }

    // 2. Content+sender dedup within 10s window (catches broadcast vs postgres_changes duplicates)
    const msgTime = new Date(parsedMsg.created_at).getTime();
    const contentDupe = existing.find(
      m => m.content === parsedMsg.content 
        && m.sender_id === parsedMsg.sender_id 
        && Math.abs(new Date(m.created_at).getTime() - msgTime) < 10000
    );
    if (contentDupe) {
      // If existing is optimistic and new is real, upgrade it
      if (contentDupe.id.startsWith('optimistic-') && !parsedMsg.id.startsWith('optimistic-')) {
        const idx = existing.indexOf(contentDupe);
        const updated = [...existing];
        updated[idx] = parsedMsg;
        return { messages: { ...state.messages, [chatId]: updated } };
      }
      // Otherwise it's a true duplicate, skip
      return state;
    }
    return {
      messages: { ...state.messages, [chatId]: [...existing, parsedMsg] }
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
