// STUB — replaced by the text engine.
// Contract:
//   listFields(html): string[]                         names of field spans in order (unique)
//   substituteFields(html, resolve(name) => string|null|undefined): string
//       replaces <span class="field" data-field="NAME">…</span> with the escaped resolved value
//       (unresolved fields keep their «NAME» placeholder text).
//   fieldSpan(name): string                             HTML for inserting a field
const FIELD_RE = /<span\b[^>]*\bclass="field"[^>]*\bdata-field="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function listFields(html) {
  const out = [];
  for (const m of String(html).matchAll(FIELD_RE)) { const n = unesc(m[1]); if (!out.includes(n)) out.push(n); }
  return out;
}
export function substituteFields(html, resolve) {
  return String(html).replace(FIELD_RE, (all, name) => {
    const v = resolve(unesc(name));
    return v === null || v === undefined ? all : esc(v);
  });
}
export function fieldSpan(name) {
  return `<span class="field" data-field="${esc(name)}" contenteditable="false">«${esc(name)}»</span>`;
}
