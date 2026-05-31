with open('/Users/imran/Documents/Talkfuze/src/app/widget/[org_id]/page.tsx', 'r') as f:
    content = f.read()

target1 = "const hasAutoResumedRef = useRef(false)"
replace1 = """const hasAutoResumedRef = useRef(false)
  const isWidgetOpenRef = useRef(false)
  const unreadCountRef = useRef(0)"""
content = content.replace(target1, replace1)

target2 = """    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TALKFUZE_PAGE_VIEW') {"""
replace2 = """    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TALKFUZE_OPENED') {
        isWidgetOpenRef.current = true;
        unreadCountRef.current = 0;
        window.parent.postMessage({ type: 'TALKFUZE_UNREAD_COUNT', count: 0 }, '*');
      }
      if (event.data?.type === 'TALKFUZE_CLOSED') {
        isWidgetOpenRef.current = false;
      }
      if (event.data?.type === 'TALKFUZE_PAGE_VIEW') {"""
content = content.replace(target2, replace2)

target3 = """                if (newMsg.sender_type !== 'contact') {
                    playUISound('receive', 'intercom');
                    if (wasDelayed && pendingDelaysRef.current === 0) {"""
replace3 = """                if (newMsg.sender_type !== 'contact') {
                    playUISound('receive', 'intercom');
                    
                    if (!isWidgetOpenRef.current) {
                        unreadCountRef.current += 1;
                        window.parent.postMessage({ type: 'TALKFUZE_UNREAD_COUNT', count: unreadCountRef.current }, '*');
                    }
                    
                    if (wasDelayed && pendingDelaysRef.current === 0) {"""
content = content.replace(target3, replace3)

target4 = """  }, [messages, org_id, deviceId, settings, activeConversationId]);

  const toggleCoBrowsing = async () => {"""
replace4 = """  }, [messages, org_id, deviceId, settings, activeConversationId]);

  // Sync agent avatar to parent widget
  useEffect(() => {
    if (messages.length > 0) {
      const lastAgentMsg = [...messages].reverse().find(m => m.sender_type === 'agent' && m.agent?.avatar_url);
      if (lastAgentMsg) {
        window.parent.postMessage({ type: 'TALKFUZE_AGENT_AVATAR', avatarUrl: lastAgentMsg.agent.avatar_url }, '*');
      }
    }
  }, [messages]);

  const toggleCoBrowsing = async () => {"""
content = content.replace(target4, replace4)

with open('/Users/imran/Documents/Talkfuze/src/app/widget/[org_id]/page.tsx', 'w') as f:
    f.write(content)
