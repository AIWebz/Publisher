// STUB — replaced by the text engine. Contract: sanitizeHtml(html: string): string
// Returns story HTML restricted to the whitelist in ARCHITECTURE.md (Rich text HTML).
export function sanitizeHtml(html) {
  return String(html ?? '').replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}
