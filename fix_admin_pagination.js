const fs = require('fs');

let content = fs.readFileSync('src/components/inbox/ChatThread.tsx', 'utf-8');

const stateTarget = `  const [isSending, setIsSending] = useState(false)`;
const stateReplacement = `  const [isSending, setIsSending] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)`;

content = content.replace(stateTarget, stateReplacement);

const importTarget = `import { replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation, uploadAgentMedia } from "@/actions/dashboard"`;
const importReplacement = `import { getMessages, replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation, uploadAgentMedia } from "@/actions/dashboard"`;

content = content.replace(importTarget, importReplacement);

const fetchTarget = `  const handleSend = async () => {`;
const fetchReplacement = `  const loadMoreMessages = async () => {
    if (!messages.length || isLoadingMore || !hasMoreMessages || !conversationId) return;
    setIsLoadingMore(true);
    const oldestMsg = messages[0];
    try {
      const olderMessages = await getMessages(conversationId, 50, oldestMsg.created_at);
      if (olderMessages.length > 0) {
        useInboxStore.getState().setMessages(conversationId, [...olderMessages, ...messages]);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const handleSend = async () => {`;

content = content.replace(fetchTarget, fetchReplacement);

const uiTarget = `      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#0B0F19]">`;
const uiReplacement = `      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#0B0F19]">
        
        {messages.length >= 50 && hasMoreMessages && (
          <div className="flex justify-center mb-6">
            <button 
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? "Loading..." : "Load previous messages"}
            </button>
          </div>
        )}`;

content = content.replace(uiTarget, uiReplacement);

fs.writeFileSync('src/components/inbox/ChatThread.tsx', content);
console.log("Fixed Admin Pagination");
