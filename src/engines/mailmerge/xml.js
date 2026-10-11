// Small streaming XML tokenizer (no DOMParser needed) for spreadsheet parts.
//   xmlTokens(text) yields { type: 'start', name, local, attrs, selfClosing } | { type: 'end', name, local }
//                        | { type: 'text', text }   (entities decoded; CDATA returned as text)
// Comments, processing instructions and DOCTYPE are skipped. Names keep their prefix ('table:table-row');
// `local` is the name without prefix. Attribute keys keep their prefix too.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Decode XML character and predefined entity references.
 * @param {string} s
 * @returns {string}
 */
export function decodeXml(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENT[e] ?? m;
  });
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const localName = (n) => { const i = n.indexOf(':'); return i < 0 ? n : n.slice(i + 1); };

/**
 * Tokenize XML text.
 * @param {string} text
 * @returns {Generator<{type: string, name?: string, local?: string, attrs?: Object<string,string>, selfClosing?: boolean, text?: string}>}
 */
export function* xmlTokens(text) {
  const s = String(text ?? '');
  const n = s.length;
  let i = 0;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { yield { type: 'text', text: decodeXml(s.slice(i)) }; return; }
    if (lt > i) yield { type: 'text', text: decodeXml(s.slice(i, lt)) };
    if (s.startsWith('<!--', lt)) {
      const e = s.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', lt)) {
      const e = s.indexOf(']]>', lt + 9);
      yield { type: 'text', text: s.slice(lt + 9, e < 0 ? n : e) };
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (s[lt + 1] === '?') {
      const e = s.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (s[lt + 1] === '!') {
      // DOCTYPE (possibly with an internal subset in brackets)
      let j = lt + 2, depth = 0;
      for (; j < n; j++) {
        if (s[j] === '[') depth++;
        else if (s[j] === ']') depth--;
        else if (s[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    // find the end of the tag, skipping quoted attribute values
    let j = lt + 1, q = '';
    for (; j < n; j++) {
      const c = s[j];
      if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
    }
    const body = s.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === '/') {
      const name = body.slice(1).trim();
      yield { type: 'end', name, local: localName(name) };
      continue;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const m = /^[^\s/>]+/.exec(inner);
    const name = m ? m[0] : '';
    const attrs = {};
    ATTR_RE.lastIndex = name.length;
    let a;
    while ((a = ATTR_RE.exec(inner))) attrs[a[1]] = decodeXml(a[2] ?? a[3] ?? '');
    yield { type: 'start', name, local: localName(name), attrs, selfClosing };
  }
}

/**
 * Attribute lookup by local name (ignores the namespace prefix): attr(t.attrs, 'id') finds 'r:id'.
 * An exact key match wins.
 * @param {Object<string,string>} attrs
 * @param {string} local
 * @returns {string|undefined}
 */
export function attr(attrs, local) {
  if (!attrs) return undefined;
  if (local in attrs) return attrs[local];
  for (const k in attrs) if (localName(k) === local) return attrs[k];
  return undefined;
}
