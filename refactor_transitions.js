const fs = require('fs');
const file = '/Users/imran/Documents/Talkfuze/src/app/widget/[org_id]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add 'chat' to Tab type
content = content.replace(
  "type Tab = 'home' | 'messages' | 'tickets' | 'about'",
  "type Tab = 'home' | 'messages' | 'chat' | 'tickets' | 'about'"
);

// 2. Main Content Area container
content = content.replace(
  "<div className={`flex-1 overflow-y-auto relative z-10 ${activeTab === 'messages' ? 'bg-[#f9fafb]' : 'pb-[80px]'} scrollbar-hide`}>",
  "<div className=\"flex-1 relative z-10 overflow-hidden bg-[#f9fafb]\">"
);

// 3. Home Tab opening
content = content.replace(
  "{activeTab === 'home' && (\n          <div className=\"px-5 pt-12 pb-6 flex flex-col gap-5 animate-in fade-in duration-200 ease-out\">",
  `<div className={\`absolute inset-0 overflow-y-auto pb-[80px] scrollbar-hide bg-[#f9fafb] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] \${activeTab === 'home' ? 'translate-x-0 opacity-100 z-30' : '-translate-x-[20%] opacity-0 z-10 pointer-events-none'}\`}>\n          <div className="px-5 pt-12 pb-6 flex flex-col gap-5">`
);

// 4. Home Tab closing
content = content.replace(
  "            </div>\n            \n          </div>\n        )}",
  "            </div>\n            \n          </div>\n        </div>"
);

// 5. Conversations List Tab opening
content = content.replace(
  "{activeTab === 'messages' && !activeConversationId && (\n          <div className=\"h-full flex flex-col relative z-30 bg-[#f9fafb] animate-in fade-in duration-200 ease-out\">",
  `<div className={\`absolute inset-0 overflow-y-auto pb-[120px] scrollbar-hide bg-[#f9fafb] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] \${activeTab === 'messages' ? 'translate-x-0 opacity-100 z-30' : activeTab === 'home' ? 'translate-x-full opacity-0 z-10 pointer-events-none' : '-translate-x-[20%] opacity-0 z-10 pointer-events-none'}\`}>`
);

// 6. Conversations List Tab closing
content = content.replace(
  "               </button>\n            </div>\n          </div>\n        )}",
  "               </button>\n            </div>\n          </div>\n        </div>"
);

// 7. Chat Tab opening
content = content.replace(
  "{activeTab === 'messages' && activeConversationId && (\n          <div className=\"h-full flex flex-col relative z-30 bg-white animate-in fade-in duration-200 ease-out\">",
  `<div className={\`absolute inset-0 overflow-hidden bg-white flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] \${activeTab === 'chat' ? 'translate-x-0 opacity-100 z-30' : 'translate-x-full opacity-0 z-10 pointer-events-none'}\`}>\n            {activeConversationId && (\n              <div className="h-full flex flex-col relative z-30">`
);

// 8. Chat Tab closing (around line 1005)
content = content.replace(
  "                 </div>\n               </>\n             )}\n          </div>\n        )}",
  "                 </div>\n               </>\n             )}\n              </div>\n            )}\n        </div>"
);

// 9. Update state handlers for opening chat
content = content.replace(
  "onClick={() => { setActiveConversationId(conversations[0]?.id || 'new'); setActiveTab('messages'); }}",
  "onClick={() => { setActiveConversationId(conversations[0]?.id || 'new'); setActiveTab('chat'); }}"
);
content = content.replace(
  "onClick={() => { setActiveConversationId('new'); setActiveTab('messages'); }}",
  "onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }}"
);
content = content.replace(
  "onClick={() => { setActiveConversationId('new')} } className=\"pointer-events-auto",
  "onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }} className=\"pointer-events-auto"
);
content = content.replace(
  "onClick={() => setActiveConversationId(conv.id)} className=\"bg-white p-4 cursor-pointer",
  "onClick={() => { setActiveConversationId(conv.id); setActiveTab('chat'); }} className=\"bg-white p-4 cursor-pointer"
);

// 10. Update going back from Chat
content = content.replace(
  "onClick={() => setActiveConversationId(null)} className=\"text-slate-400",
  "onClick={() => setActiveTab('messages')} className=\"text-slate-400"
);

// 11. Bottom nav logic update
content = content.replace(
  "{activeTab !== 'messages' && (",
  "{activeTab !== 'messages' && activeTab !== 'chat' && ("
);

fs.writeFileSync(file, content);
console.log('Refactor complete');
