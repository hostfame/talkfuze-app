const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

// 1. Add states
const stateTarget = `  const [input, setInput] = useState("")`;
const stateReplacement = `  const [input, setInput] = useState("")
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)`;

content = content.replace(stateTarget, stateReplacement);

// 2. Add channel subscription for typing
const channelTarget = `    const channel = supabase
      .channel('public:messages')`;
const channelReplacement = `    const typingChannel = supabase.channel(\`typing:\${org_id}\`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {
        if (payload.payload.direction === 'agent' && payload.payload.conversation_id === activeConversationId) {
          setIsAgentTyping(payload.payload.is_typing)
        }
      })
      .subscribe()
      
    const channel = supabase
      .channel('public:messages')`;

content = content.replace(channelTarget, channelReplacement);

// 3. Add channel unsubscription
const unsubTarget = `      supabase.removeChannel(channel)`;
const unsubReplacement = `      supabase.removeChannel(channel)
      supabase.removeChannel(typingChannel)`;

content = content.replace(unsubTarget, unsubReplacement);

// 4. Add onChange handler logic
const textTarget = `onChange={(e) => setInput(e.target.value)}`;
const textReplacement = `onChange={(e) => {
                        setInput(e.target.value)
                        if (activeConversationId && activeConversationId !== 'new') {
                          supabase.channel(\`typing:\${org_id}\`).send({
                            type: 'broadcast',
                            event: 'typingStatus',
                            payload: { conversation_id: activeConversationId, direction: 'contact', is_typing: true }
                          })
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                          typingTimeoutRef.current = setTimeout(() => {
                            supabase.channel(\`typing:\${org_id}\`).send({
                              type: 'broadcast',
                              event: 'typingStatus',
                              payload: { conversation_id: activeConversationId, direction: 'contact', is_typing: false }
                            })
                          }, 2000)
                        }
                      }}`;

content = content.replace(textTarget, textReplacement);

// 5. Update typing indicator UI
const typingUiTarget = `<div className="flex items-start gap-1 opacity-0 transition-opacity duration-300 hidden" id="tf-typing-indicator">`;
const typingUiReplacement = `{isAgentTyping && (
              <div className="flex items-start gap-1 animate-in fade-in duration-300" id="tf-typing-indicator">
                 <div className="w-6 h-6 rounded-full border border-slate-100 bg-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                    <img src={activeAgent?.avatar_url || "/team/h.jpg"} className="w-full h-full object-cover" />
                 </div>
                 <div className="bg-white border border-slate-100 rounded-[16px] rounded-tl-[4px] py-2 px-3.5 shadow-sm text-slate-500 text-[13px] flex items-center gap-1 min-h-[36px]">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                 </div>
              </div>
              )}
              <div className="hidden" id="tf-old-typing-indicator">`;

content = content.replace(typingUiTarget, typingUiReplacement);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log("Updated widget typing");
