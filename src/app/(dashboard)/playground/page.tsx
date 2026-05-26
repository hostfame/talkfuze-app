"use client"

import { useState, useRef, useEffect } from "react"
import { 
  Bot, 
  User, 
  Send, 
  Play, 
  Trash2,
  AlertCircle,
  BrainCircuit,
  MessageSquare,
  Wrench,
  CheckCircle2,
  RefreshCcw,
  Sparkles
} from "lucide-react"

type Message = {
  id: string
  sender: 'Agent' | 'Customer' | 'System'
  content: string
}

export default function AIPlayground() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'Customer', content: 'hello brother' },
    { id: '2', sender: 'Agent', content: 'Hello! How can I help you today?' },
  ])
  const [inputMessage, setInputMessage] = useState("")
  const [instruction, setInstruction] = useState("")
  const [sender, setSender] = useState<'Agent' | 'Customer'>('Customer')
  
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftResult, setDraftResult] = useState("")
  
  // Debug Info
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)
  const [matchedRules, setMatchedRules] = useState<string[]>([])
  
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAddMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputMessage.trim()) return

    setMessages(prev => [
      ...prev, 
      { id: Date.now().toString(), sender, content: inputMessage }
    ])
    setInputMessage("")
  }

  const handleGenerateDraft = async () => {
    setIsDrafting(true)
    setDraftResult("")
    setDetectedLanguage(null)
    setMatchedRules([])

    try {
      // Build context string from messages
      const contextMessages = messages.map(m => `[${m.sender}]: ${m.content}`).join('\n')

      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextMessages,
          contactName: "Playground Customer",
          instruction: instruction.trim() || undefined,
          orgId: "playground"
        })
      })

      if (!res.ok) throw new Error("Failed to fetch draft")

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error("No reader")

      let firstChunk = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              
              // First chunk usually contains language and sources
              if (firstChunk && (data.language || data.sources)) {
                if (data.language) setDetectedLanguage(data.language === 'bn' ? 'Bengali' : 'English')
                if (data.sources) setMatchedRules(data.sources)
                firstChunk = false
              }
              
              if (data.text) {
                setDraftResult(prev => prev + data.text)
              }
            } catch (e) {
              console.error("Error parsing SSE JSON", e)
            }
          }
        }
      }
    } catch (err: any) {
      setDraftResult(`Error: ${err.message}`)
    } finally {
      setIsDrafting(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setDraftResult("")
    setDetectedLanguage(null)
    setMatchedRules([])
    setInstruction("")
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] dark:bg-[#0b141a] overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111b21] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-[#e9edef]">
              AI Sandbox Playground
            </h1>
            <p className="text-xs text-slate-500">Test prompts, rules, and language detection safely.</p>
          </div>
        </div>
        
        <button 
          onClick={clearChat}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={14} /> Clear Scenario
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        
        {/* LEFT PANEL: Chat Simulator */}
        <div className="w-full lg:w-1/2 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111b21]">
          
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#111b21] flex items-center gap-2">
            <MessageSquare size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Conversation Context</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <MessageSquare size={32} className="mb-3 opacity-20" />
                <p className="text-sm">No messages. Add some context to start testing.</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender === 'Customer' ? 'mr-auto items-start' : 'ml-auto items-end'}`}>
                  <span className="text-[10px] font-semibold text-slate-400 mb-1 px-1 uppercase tracking-wider">{msg.sender}</span>
                  <div className={`px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words ${
                    msg.sender === 'Customer' 
                      ? 'bg-slate-100 dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] rounded-tl-sm' 
                      : 'bg-indigo-500 text-white rounded-tr-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-slate-50 dark:bg-[#202c33]/30 border-t border-slate-100 dark:border-slate-800">
            <form onSubmit={handleAddMessage} className="flex gap-2">
              <select 
                value={sender}
                onChange={(e) => setSender(e.target.value as 'Agent' | 'Customer')}
                className="bg-white dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="Customer">Customer</option>
                <option value="Agent">Agent</option>
              </select>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-white dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
              <button 
                type="submit"
                disabled={!inputMessage.trim()}
                className="bg-slate-800 dark:bg-slate-700 text-white p-2 rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors shrink-0"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: Draft & Debug */}
        <div className="w-full lg:w-1/2 flex flex-col bg-[#F8FAFC] dark:bg-[#0b141a]">
          
          <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
            
            {/* AI Control Panel */}
            <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#2a3942] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench size={16} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e9edef]">Agent Whisper (Assist)</h3>
              </div>
              
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="// Tell AI what to do (e.g. '// we do not offer refunds')"
                className="w-full bg-slate-50 dark:bg-[#202c33]/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 min-h-[80px] resize-none"
              />

              <button
                onClick={handleGenerateDraft}
                disabled={isDrafting || messages.length === 0}
                className="w-full bg-[#0070f3] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#005bd2] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {isDrafting ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isDrafting ? "Drafting..." : "Generate AI Draft"}
              </button>
            </div>

            {/* AI Result */}
            {(draftResult || isDrafting) && (
              <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bot size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">AI Response</h3>
                  </div>
                </div>
                
                <div className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words p-4 rounded-xl bg-slate-50 dark:bg-[#202c33]/50 border border-slate-100 dark:border-slate-800 min-h-[100px]">
                  {draftResult || <span className="text-slate-400 italic">Thinking...</span>}
                </div>
              </div>
            )}

            {/* Debug Info */}
            {(detectedLanguage || matchedRules.length > 0) && (
              <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-amber-100 dark:border-amber-900/20 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle size={16} className="text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">X-Ray Debugger</h3>
                </div>

                <div className="space-y-4">
                  {detectedLanguage && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Language Override Decision</span>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <CheckCircle2 size={12} />
                        {detectedLanguage}
                      </div>
                    </div>
                  )}

                  {matchedRules.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">RAG Rules Hit ({matchedRules.length})</span>
                      <div className="space-y-2">
                        {matchedRules.map((rule, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#202c33]/50 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono break-words leading-relaxed">
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
