import { Filter, ChevronDown, Search, Plus, X, Phone, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { searchConversations, createConversation } from "@/actions/dashboard"

export default function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect,
  typingState = {},
  orgId
}: { 
  conversations: any[], 
  selectedId: string | null,
  onSelect: (id: string) => void,
  typingState?: Record<string, boolean>,
  orgId: string
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  
  const [showNewChatModal, setShowNewChatModal] = useState(false)
  const [newChatNumber, setNewChatNumber] = useState("")
  const [searchResult, setSearchResult] = useState<'idle' | 'not_found' | 'loading'>('idle')
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Execute backend search
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    const doSearch = async () => {
      setIsSearching(true)
      try {
        const results = await searchConversations(orgId, debouncedQuery)
        setSearchResults(results)
      } catch (e) {
        console.error(e)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    doSearch()
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
      onSelect(newConvId);
      setShowNewChatModal(false);
      setNewChatNumber("");
      setSearchResult('idle');
    } catch (e) {
      console.error(e);
      setSearchResult('not_found');
    }
  };

  const displayedConversations = searchResults !== null ? searchResults : conversations;

  return (
    <div className="flex flex-col h-full w-[320px] shrink-0 bg-white border-r border-slate-200 z-10 relative">
      
      {/* Header & Filters */}
      <div className="px-5 pt-5 pb-3 flex flex-col gap-5 shrink-0 bg-white border-b border-slate-200">
        <div className="flex justify-between items-center">
          <h2 className="font-medium text-[16px] text-slate-900">All</h2>
          <button 
             onClick={() => setShowNewChatModal(true)}
             className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
          >
             <Plus size={18} strokeWidth={2} />
          </button>
        </div>
        
        <div className="flex gap-4">
          <button className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 hover:text-slate-700 transition-colors">
            0 Open <ChevronDown size={14} className="text-slate-500" strokeWidth={2} />
          </button>
          <button className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 hover:text-slate-700 transition-colors">
            Newest <ChevronDown size={14} className="text-slate-500" strokeWidth={2} />
          </button>
        </div>
        {/* Search Bar */}
        <div className="relative mt-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching ? <Loader2 size={14} className="text-blue-500 animate-spin" /> : <Search size={14} className="text-slate-400" />}
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-all"
            placeholder="Search contact or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
        {displayedConversations.length === 0 && !isSearching && (
          <p className="text-[13px] text-slate-400 text-center mt-10">
            {searchResults !== null ? "No matching conversations" : "No active conversations"}
          </p>
        )}

        {displayedConversations
          .map((conv, i) => {
          const isSelected = conv.id === selectedId
          const contactName = conv.contact?.name || "Unknown"
          const time = new Date(conv.last_message_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          
          const avatarColor = avatarColors[i % avatarColors.length]
          const isWhatsApp = conv.channels?.type === 'whatsapp'
          const isFacebook = conv.channels?.type === 'facebook'
          const assigneeName = conv.assignee?.full_name || 'Hostnin' // Fallback to Hostnin for demo
          const isTyping = typingState[conv.id]

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
              className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer border-b border-slate-100/50 transition-none ${
                isSelected 
                  ? 'bg-[#E5F1FF]/50 relative' 
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600"></div>}
              
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[14px] tracking-wide shrink-0 text-white ${avatarColor}`}>
                {getInitials(contactName)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 mt-0.5">
                <div className="flex justify-between items-baseline mb-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className={`text-[14.5px] truncate ${isSelected ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
                      {contactName}
                    </span>
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                      {assigneeName}
                    </span>
                  </div>
                  <span className={`text-[11px] shrink-0 ml-2 ${isSelected ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
                    {time}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
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
                    <p className="text-[13px] text-blue-500 font-medium truncate leading-snug animate-pulse flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      typing...
                    </p>
                  ) : (
                    <p className="text-[13px] text-slate-500 truncate leading-snug">
                      Waiting for reply...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showNewChatModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-[400px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-6">
                <span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">WhatsApp number *</span>
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
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50"
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
        </div>
      )}
    </div>
  )
}
