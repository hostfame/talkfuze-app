import { Filter, ChevronDown } from "lucide-react"

export default function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect 
}: { 
  conversations: any[], 
  selectedId: string | null,
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col h-full w-[320px] shrink-0 bg-white border-r border-slate-200 z-10">
      
      {/* Header & Filters */}
      <div className="px-5 pt-5 pb-3 flex flex-col gap-5 shrink-0 bg-white border-b border-slate-200">
        <div className="flex justify-between items-center">
          <h2 className="font-medium text-[16px] text-slate-900">All</h2>
        </div>
        
        <div className="flex gap-4">
          <button className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 hover:text-slate-700 transition-colors">
            0 Open <ChevronDown size={14} className="text-slate-500" strokeWidth={2} />
          </button>
          <button className="flex items-center gap-1.5 text-[13px] font-medium text-slate-900 hover:text-slate-700 transition-colors">
            Newest <ChevronDown size={14} className="text-slate-500" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
        {conversations.length === 0 && (
          <p className="text-[13px] text-slate-400 text-center mt-10">No active conversations</p>
        )}

        {conversations.map(conv => {
          const isSelected = conv.id === selectedId
          const contactName = conv.contact?.name || "Unknown"
          const time = new Date(conv.last_message_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

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
              <div className="w-8 h-8 rounded-md flex items-center justify-center font-medium text-[12px] shrink-0 bg-slate-100 text-slate-600">
                {contactName.substring(0, 2).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className={`text-[14px] truncate ${isSelected ? 'font-medium text-slate-900' : 'font-medium text-slate-800'}`}>
                    {contactName}
                  </span>
                  <span className={`text-[12px] shrink-0 ml-2 ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>
                    {time}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[13px] text-slate-500 truncate leading-snug">
                    Waiting for reply...
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
