export function formatMessageLinks(text: string): string {
  if (!text) return text;
  
  let formatted = text;
  
  // 1. Ensure exactly one newline before the URL (separates link from attached text like "here:http")
  formatted = formatted.replace(/([^\n])\s*(https?:\/\/)/gi, '$1\n$2');
  
  // 2. Add double newline before the sentence that introduces the link
  // Matches: period, spaces, then a Capital letter, text ending in colon, newline, and http
  formatted = formatted.replace(/(\.)\s+([A-Z][^\.\n]*?:\nhttps?:\/\/)/g, '$1\n\n$2');
  
  return formatted;
}
