import { Search, Plus, X, Phone, Loader2, Mic, Image as ImageIcon, Video, Paperclip, MessageSquare } from "lucide-react"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { searchConversations, createConversation } from "@/actions/dashboard"
import { useInboxStore } from "@/lib/store"
import type { ConversationWithDetails, Relation } from "@/lib/types"

function firstRelation<T>(relation: Relation<T> | undefined) {
  return Array.isArray(relation) ? relation[0] : relation
}

const avatarHexColors = [
  '0070f3', // Brand blue
  '10b981', // Emerald green
  '8b5cf6', // Violet
  'ec4899', // Pink
  'f59e0b', // Amber
  '06b6d4', // Cyan
  'd946ef', // Fuchsia
  'f43f5e', // Rose
  '14b8a6', // Teal
  '6366f1', // Indigo
];

const getConversationAvatarUrl = (convId: string, name: string) => {
  let hash = 0;
  for (let i = 0; i < convId.length; i++) {
    hash = convId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatarHexColors.length;
  const colorHex = avatarHexColors[index];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colorHex}&color=fff&length=1`;
};

const stripAgentNamePrefix = (text: string) => {
  if (!text) return text;
  const match = text.match(/^\*([^*]+)\*\s*\n?/);
  if (match) {
    const stripped = text.substring(match[0].length).trim();
    return stripped || match[1];
  }
  return text;
};

export default function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect,
  typingState = {},
  onlineUsers = new Set<string>(),
  orgId
}: { 
  conversations: ConversationWithDetails[], 
  selectedId: string | null,
  onSelect: (id: string) => void,
  typingState?: Record<string, boolean>,
  onlineUsers?: Set<string>,
  orgId: string
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ConversationWithDetails[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showNewChatModal, setShowNewChatModal] = useState(false)
  const [newChatNumber, setNewChatNumber] = useState("")
  const [searchResult, setSearchResult] = useState<'idle' | 'not_found' | 'loading'>('idle')
  
  const { activeFilter, currentUser, isLoaded } = useInboxStore()
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Execute backend search
  useEffect(() => {
    if (!debouncedQuery) {
      return
    }

    const doSearch = async () => {
      setIsSearching(true)
      try {
        const results = await searchConversations(orgId, debouncedQuery)
        setSearchResults(results as ConversationWithDetails[])
      } catch (e) {
        console.error(e)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    void doSearch()
  }, [debouncedQuery, orgId])

  // Array of vibrant colors for avatars
  const avatarColors = [
    'bg-blue-600', 'bg-emerald-500', 'bg-violet-600', 
    'bg-rose-500', 'bg-amber-500', 'bg-cyan-500', 'bg-fuchsia-500'
  ];

  const handleCheckNumber = async () => {
    if (!newChatNumber) return;
    setSearchResult('loading');
    try {
      const newConvId = await createConversation(orgId, newChatNumber);
      setShowNewChatModal(false);
      setNewChatNumber("");
      setSearchResult('idle');
      onSelect(newConvId);
    } catch (e) {
      console.error(e);
      setSearchResult('not_found');
    }
  };

  const isArchivedFilter = activeFilter === 'archived' || activeFilter === 'ticketed';
  const sourceConversations = isArchivedFilter ? useInboxStore.getState().archivedConversations : conversations;
  const baseConversations = debouncedQuery && searchResults !== null ? searchResults : sourceConversations;
  
  // Apply team management filters
  const displayedConversations = baseConversations.filter(conv => {
    if (activeFilter === 'archived') return conv.is_archived;
    if (activeFilter === 'ticketed') return conv.is_archived && conv.tags?.includes('ticketed');
    if (conv.is_archived) return false;

    // Filter out snoozed conversations
    // @ts-ignore
    const snoozedUntil = conv.snoozed_until;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) {
      return false; // Hide snoozed conversations
    }

    const isAlert = conv.tags?.includes('alert');
    if (activeFilter === 'alerts') {
      return isAlert;
    }
    if (isAlert) return false;

    if (activeFilter === 'unread') {
      const channel = firstRelation(conv.channels);
      if (channel?.type !== 'whatsapp' && channel?.type !== 'widget') return false;

      const validMsgs = conv.messages?.filter((m: any) => {
        let safeMeta = m.metadata;
        try { if (typeof safeMeta === 'string') safeMeta = JSON.parse(safeMeta); } catch (e) {}
        return safeMeta?.event !== 'page_view' && !m.content?.startsWith('Viewed:');
      }) || [];
      const lastMsg = (conv as any).matched_message || (validMsgs.length > 0 ? validMsgs[0] : null);
      return lastMsg && lastMsg.sender_type === 'contact' && lastMsg.status !== 'read' && lastMsg.content_type !== 'system';
    }

    if (activeFilter === 'all') return true;
    
    const assignee = firstRelation(conv.assignee);
    if (activeFilter === 'mine' || activeFilter === 'assigned') {
      return assignee?.id === currentUser?.id;
    }
    if (activeFilter === 'pinned') {
      return conv.is_pinned;
    }
    if (activeFilter === 'mentions') {
      // Mentions filter not fully implemented in MVP, return empty or implement later
      return false;
    }
    
    // Social Channel Filters
    const channel = firstRelation(conv.channels);
    if (activeFilter === 'messenger') {
      return channel?.type === 'messenger';
    }
    if (activeFilter === 'whatsapp') {
      return channel?.type === 'whatsapp';
    }
    if (activeFilter === 'instagram') {
      return channel?.type === 'instagram';
    }
    if (activeFilter === 'widget') {
      return channel?.type === 'widget';
    }
    
    return true;
  });

  return (
    <div className="flex flex-col h-full w-full shrink-0 bg-white dark:bg-[#111b21] border-r border-slate-200 dark:border-[#222e35] z-10 relative">
      
      {/* Header & Search */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 shrink-0 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        {/* Search Bar */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching ? <Loader2 size={14} className="text-blue-500 animate-spin" /> : <Search size={14} className="text-slate-400 dark:text-[#8696a0]" />}
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-[#2a3942] rounded-lg text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 dark:placeholder-[#8696a0] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 dark:bg-[#202c33] transition-all"
            placeholder="Search contact or keyword..."
            value={searchQuery}
            onChange={(e) => {
              const nextQuery = e.target.value
              setSearchQuery(nextQuery)
              setSearchResults(null)
              setIsSearching(Boolean(nextQuery.trim()))
            }}
          />
        </div>
        <button 
           onClick={() => setShowNewChatModal(true)}
           className="text-slate-500 hover:text-slate-700 dark:text-[#8696a0] dark:hover:text-[#e9edef] p-2 border border-slate-200 dark:border-[#2a3942] hover:border-slate-300 dark:hover:border-[#222e35] rounded-lg transition-colors bg-slate-50 dark:bg-[#202c33] hover:bg-slate-100 dark:hover:bg-[#2a3942] shrink-0"
           title="New Chat"
        >
           <Plus size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Pill Filters */}
      <div className="px-5 py-2 flex items-center gap-2 overflow-x-auto shrink-0 bg-white dark:bg-[#111b21] border-b border-slate-100 dark:border-[#222e35]/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {(() => {
          const getPillCount = (id: string) => {
            if (id === 'all') return conversations.filter(c => !c.tags?.includes('alert') && !c.is_archived).length;
            if (id === 'unread') return conversations.filter(c => {
              if (c.is_archived || c.tags?.includes('alert')) return false;
              const channel = firstRelation(c.channels);
              if (channel?.type !== 'whatsapp' && channel?.type !== 'widget') return false;
              const validMsgs = c.messages?.filter((m: any) => {
                let safeMeta = m.metadata;
                try { if (typeof safeMeta === 'string') safeMeta = JSON.parse(safeMeta); } catch (e) {}
                return safeMeta?.event !== 'page_view' && !m.content?.startsWith('Viewed:');
              }) || [];
              const lastMsg = (c as any).matched_message || (validMsgs.length > 0 ? validMsgs[0] : null);
              return lastMsg && lastMsg.sender_type === 'contact' && lastMsg.status !== 'read' && lastMsg.content_type !== 'system';
            }).length;
            if (id === 'pinned') return conversations.filter(c => c.is_pinned && !c.tags?.includes('alert') && !c.is_archived).length;
            if (id === 'mine') return conversations.filter(c => firstRelation(c.assignee)?.id === currentUser?.id && !c.is_archived && !c.tags?.includes('alert')).length;
            if (id === 'alerts') return conversations.filter(c => c.tags?.includes('alert') && !c.is_archived).length;
            return 0;
          };

          return [
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'pinned', label: 'Pinned' },
            { id: 'mine', label: 'Mine' },
            { id: 'alerts', label: 'Out' },
            { id: 'archived', label: 'Bin' }
          ].map((pill) => {
            const count = getPillCount(pill.id);
            const isActive = activeFilter === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => useInboxStore.getState().setActiveFilter(pill.id as any)}
                className={`flex items-center whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                  isActive
                    ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#111b21] dark:border-[#2a3942] dark:text-[#8696a0] dark:hover:bg-[#202c33]'
                }`}
              >
                {pill.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive 
                      ? 'bg-blue-200/50 text-blue-700 dark:bg-blue-800/50 dark:text-blue-300' 
                      : 'bg-slate-100 text-slate-500 dark:bg-[#2a3942] dark:text-[#8696a0]'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })
        })()}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-white dark:bg-[#111b21]">
        {(!isLoaded || (isArchivedFilter && useInboxStore.getState().isFetchingArchived)) ? (
          <div className="px-3 py-4 space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="flex justify-between items-center">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-8"></div>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : displayedConversations.length === 0 && !isSearching ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#111b21] mt-10">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-full flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-800">
              <MessageSquare size={24} className="text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {activeFilter === 'ticketed' ? 'No ticketed conversations' : activeFilter === 'archived' ? 'No archived conversations' : 'No active conversations'}
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-500 max-w-[200px]">
              {activeFilter === 'ticketed' ? "Converted tickets will appear here." : activeFilter === 'archived' ? "Archived chats will appear here." : "When a new message arrives, it will appear here."}
            </p>
          </div>
        ) : null}

        {(isLoaded && (!isArchivedFilter || !useInboxStore.getState().isFetchingArchived)) && displayedConversations
          .map((conv, i) => {
          const isSelected = conv.id === selectedId
          const contact = firstRelation(conv.contact)
          const channel = firstRelation(conv.channels)
          const assignee = firstRelation(conv.assignee)
          const contactName = contact?.name || "Unknown"
          const time = new Date(conv.last_message_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          
          const avatarColor = avatarColors[i % avatarColors.length]
          const isWhatsApp = channel?.type === 'whatsapp'
          const isFacebook = channel?.type === 'messenger'
          const assigneeName = assignee?.name
          const isTyping = typingState[conv.id]
          const isOnline = contact ? onlineUsers.has(contact.id) : false

          const validMessages = conv.messages?.filter((m: any) => {
            let safeMeta = m.metadata;
            try {
              if (typeof safeMeta === 'string') safeMeta = JSON.parse(safeMeta);
            } catch (e) {}
            return safeMeta?.event !== 'page_view' && !m.content?.startsWith('Viewed:');
          }) || [];

          const lastMessage = (conv as any).matched_message || (validMessages.length > 0 ? validMessages[0] : null)
          const isUnread = lastMessage && lastMessage.sender_type === 'contact' && lastMessage.status !== 'read' && lastMessage.content_type !== 'system'

          const getInitials = (name: string) => {
            if (name.startsWith('+')) return name.substring(0, 2)
            const parts = name.trim().split(" ").filter(Boolean)
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
            return name.substring(0, 1).toUpperCase()
          }

          return (
            <div 
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer border-b border-slate-100/50 dark:border-[#222e35]/40 transition-all duration-200 ease-in-out relative ${
                isSelected 
                  ? 'bg-[#E5F1FF]/50 dark:bg-[#2a3942]' 
                  : isUnread
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50/80 dark:hover:bg-blue-900/20'
                    : 'bg-white dark:bg-[#111b21] hover:bg-slate-50 dark:hover:bg-[#202c33]'
              }`}
            >
              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600"></div>}
              {isUnread && !isSelected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500 rounded-r-md"></div>}
              
              {/* Avatar */}
              <div className="relative">
                {contact?.avatar_url && !contact.avatar_url.includes('ui-avatars.com') && !(contact?.platform_id?.endsWith('@g.us')) ? (
                  <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center relative">
                    <img 
                      src={contact.avatar_url} 
                      alt={contactName} 
                      className="w-full h-full object-cover z-10 bg-slate-100" 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }} 
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center relative">
                    <img 
                      src={getConversationAvatarUrl(conv.id, contactName)} 
                      alt={contactName} 
                      className="w-full h-full object-cover z-10 bg-slate-100" 
                    />
                  </div>
                )}
                {isOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-20"></div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 mt-0.5 flex flex-col justify-center">
                {/* Line 1: Name and Time */}
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className={`text-[14.5px] truncate ${
                      isUnread 
                        ? 'font-bold text-black dark:text-white' 
                        : isSelected 
                          ? 'font-semibold text-slate-900 dark:text-[#e9edef]' 
                          : 'font-medium text-slate-800 dark:text-[#d1d7db]'
                    }`}>
                      {contactName}
                    </span>
                    {conv.status === 'resolved' && (
                      <span className="bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide border border-slate-200/50 dark:border-[#222e35]/50 shrink-0">
                        Resolved
                      </span>
                    )}
                    {assigneeName && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                        {assigneeName}
                      </span>
                    )}
                    {(() => {
                      if (conv.status === 'resolved' || !lastMessage || lastMessage.sender_type !== 'contact') return null
                      const lastMsgAt = new Date(conv.last_message_at).getTime()
                      const minutesElapsed = Math.floor((Date.now() - lastMsgAt) / 60000)
                      if (minutesElapsed < 2) {
                        return (
                          <span className="bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800 shrink-0">
                            {minutesElapsed === 0 ? "new" : `${minutesElapsed}m wait`}
                          </span>
                        )
                      } else if (minutesElapsed < 5) {
                        return (
                          <span className="bg-amber-50/50 dark:bg-amber-950/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-100/50 dark:border-amber-950/20 shrink-0">
                            {minutesElapsed}m SLA
                          </span>
                        )
                      } else {
                        return (
                          <span className="bg-rose-50/50 dark:bg-rose-950/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-100/50 dark:border-rose-950/20 animate-pulse shrink-0">
                            BREACH ({minutesElapsed}m)
                          </span>
                        )
                      }
                    })()}
                  </div>
                  <span className={`text-[11px] shrink-0 ml-2 ${
                    isUnread
                      ? 'text-blue-600 dark:text-[#00a884] font-bold'
                      : isSelected 
                        ? 'text-slate-500 dark:text-[#8696a0] font-medium' 
                        : 'text-slate-400 dark:text-[#8696a0]'
                  }`}>
                    {time}
                  </span>
                </div>

                {/* Line 2: Message Preview and Unread Dot */}
                <div className="flex justify-between items-center gap-2 mt-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {isWhatsApp && (
                      <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                      </svg>
                    )}
                    {isFacebook && (
                      <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111C24 4.974 18.627 0 12 0zm1.189 14.942l-3.029-3.23-5.918 3.23 6.478-6.887 3.123 3.23 5.823-3.23-6.477 6.887z"/>
                      </svg>
                    )}
                    {isTyping ? (
                      <p className="text-[13px] text-blue-500 font-semibold truncate leading-normal py-[2px] animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                        typing...
                      </p>
                    ) : (
                      <p className={`text-[13.5px] truncate leading-normal py-[2px] flex items-center gap-1 ${
                        isUnread
                          ? 'text-black dark:text-white font-bold'
                          : (lastMessage?.sender_type === 'contact' && lastMessage?.content_type !== 'system')
                            ? 'text-slate-600 dark:text-[#8696a0] font-medium'
                            : 'text-slate-400 dark:text-[#8696a0]'
                      }`}>
                        {lastMessage ? (
                          <>
                            {lastMessage.sender_type === 'agent' && <span className="text-slate-400 shrink-0">You: </span>}
                            {lastMessage.sender_type === 'ai' && <span className="text-slate-400 shrink-0">Nina: </span>}
                            {lastMessage.content_type === 'image' ? (
                              <><ImageIcon size={14} className="text-blue-500 shrink-0" /> Photo</>
                            ) : lastMessage.content_type === 'video' ? (
                              <><Video size={14} className="text-blue-500 shrink-0" /> Video</>
                            ) : lastMessage.content_type === 'audio' ? (
                              <><Mic size={14} className="text-blue-500 shrink-0" /> Voice message</>
                            ) : lastMessage.content_type === 'file' || lastMessage.content === '[Attachment]' ? (
                              <><Paperclip size={14} className="text-blue-500 shrink-0" /> Attachment</>
                            ) : (
                              stripAgentNamePrefix(lastMessage.content)
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400 italic">No messages yet</span>
                        )}
                      </p>
                    )}
                  </div>
                  {isUnread && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-[#00a884] shrink-0 shadow-[0_0_6px_rgba(37,99,235,0.4)] dark:shadow-[0_0_6px_rgba(0,168,132,0.4)]"></div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showNewChatModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111b21] rounded-xl shadow-lg w-full max-w-[400px] overflow-hidden border border-slate-200 dark:border-[#222e35] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-6">
                <span className="text-[13px] font-semibold text-slate-500 dark:text-[#8696a0] uppercase tracking-wide">WhatsApp number *</span>
                <button 
                  onClick={() => {
                    setShowNewChatModal(false);
                    setSearchResult('idle');
                  }}
                  className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1 transition-colors"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              
              <div className="w-full flex items-center gap-2 mb-6">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone size={16} className="text-slate-400" />
                  </div>
                  <input 
                    type="text" 
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-[#2a3942] rounded-lg text-[14px] text-slate-900 dark:text-[#d1d7db] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 dark:bg-[#202c33]"
                    placeholder="+1234567890"
                    value={newChatNumber}
                    onChange={(e) => {
                      setNewChatNumber(e.target.value);
                      if (searchResult !== 'idle') setSearchResult('idle');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCheckNumber();
                    }}
                  />
                </div>
                <button 
                  className="bg-transparent hover:bg-slate-50 text-slate-400 font-semibold px-4 py-2.5 rounded-lg text-[13px] transition-colors uppercase"
                  onClick={handleCheckNumber}
                  disabled={!newChatNumber}
                >
                  CHECK
                </button>
              </div>

              {searchResult === 'not_found' && (
                <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                    </svg>
                  </div>
                  <h3 className="text-[18px] font-semibold text-slate-900 mb-1">No results</h3>
                  <p className="text-[14px] text-slate-500">No results found for this number</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
