const fs = require('fs');
let content = fs.readFileSync('src/components/inbox/ChatThread.tsx', 'utf-8');

const toRemove = `  const emojiPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);`;

content = content.replace(toRemove, '');
fs.writeFileSync('src/components/inbox/ChatThread.tsx', content);
