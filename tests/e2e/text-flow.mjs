// Browser test for the text engine (flow, mergeFragments, autofit, columns, richtext).
// Run: NODE_PATH=$(npm root -g) node tests/e2e/text-flow.mjs
// Bundles src/engines/text + src/core/model.js with esbuild into a temp dir and drives Chromium.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'));
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

const out = process.env.TEXT_E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-text-'));
fs.mkdirSync(out, { recursive: true });
const entry = path.join(out, 'entry.js');
fs.writeFileSync(entry, `
import * as model from ${JSON.stringify(path.join(ROOT, 'src/core/model.js'))};
import * as flow from ${JSON.stringify(path.join(ROOT, 'src/engines/text/flow.js'))};
import * as rt from ${JSON.stringify(path.join(ROOT, 'src/engines/text/richtext.js'))};
import * as san from ${JSON.stringify(path.join(ROOT, 'src/engines/text/sanitize.js'))};
import * as fields from ${JSON.stringify(path.join(ROOT, 'src/engines/text/fields.js'))};
window.T = { model, flow, rt, san, fields };
`);
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: path.join(out, 'bundle.js'), logLevel: 'error' });
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="stage"></div><script src="bundle.js"></script>');

// TEXT_E2E_ELECTRON=1 runs the same checks inside Electron (xvfb-run on Linux).
let browser, page;
if (process.env.TEXT_E2E_ELECTRON) {
  const { _electron } = require(path.join(process.env.NODE_PATH || '', 'playwright'));
  fs.writeFileSync(path.join(out, 'main.cjs'), `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1400, height: 1000, show: true }); w.loadFile(${JSON.stringify(path.join(out, 'index.html'))}); });`);
  browser = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [path.join(out, 'main.cjs'), '--no-sandbox'] });
  page = await browser.firstWindow();
  await page.waitForLoadState('load');
  console.log('electron', await browser.evaluate(() => process.versions.chrome));
} else {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('file://' + path.join(out, 'index.html'));
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    const r = await page.evaluate(fn);
    if (r === true) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name, JSON.stringify(r).slice(0, 2000)); }
  } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 2000)); }
}

// shared helpers inside the page
await page.evaluate(() => {
  const { model, flow } = window.T;
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
  window.H = {
    para(i, n) {
      let s = '';
      for (let k = 0; k < n; k++) s += (k ? ' ' : '') + words[(i * 7 + k * 3) % words.length] + (k % 11 === 10 ? ',' : '');
      return s;
    },
    text(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.textContent; },
    makeDoc(html, frames, pages = 2) {
      const doc = model.createDocument({ pages });
      const story = model.createStory(html);
      doc.stories[story.id] = story;
      const els = frames.map((f) => model.createElement('text', { storyId: story.id, ...f }));
      els.forEach((e, i) => { e.next = els[i + 1] ? els[i + 1].id : null; doc.pages[frames[i].page || 0].elements.push(e); });
      return { doc, els, story };
    },
    /** Render a fragment like the renderer does and report whether every rect stays in the content box. */
    fits(doc, el, html, scale = 1) {
      const box = document.createElement('div');
      Object.assign(box.style, { position: 'absolute', left: '20px', top: '20px', width: el.w + 'px', height: el.h + 'px', boxSizing: 'border-box',
        padding: `${el.padding.top}px ${el.padding.right}px ${el.padding.bottom}px ${el.padding.left}px`, display: 'flex', flexDirection: 'column' });
      for (const [k, v] of Object.entries(flow.themeCSSVars(doc))) box.style.setProperty(k, v);
      const f = document.createElement('div');
      f.className = 'tx-flow';
      for (const [k, v] of Object.entries(flow.frameTextCSS(doc, el.style))) f.style.setProperty(k, v);
      if (el.columns > 1) { f.style.columnCount = el.columns; f.style.columnGap = el.colGap + 'px'; f.style.columnFill = 'auto'; f.style.height = '100%'; }
      f.innerHTML = html;
      flow.applyLayoutScale(f, scale);
      box.appendChild(f);
      document.getElementById('stage').appendChild(box);
      const b = box.getBoundingClientRect();
      const L = b.left + el.padding.left, T = b.top + el.padding.top, R = b.right - el.padding.right, B = b.bottom - el.padding.bottom;
      // every word's glyph boxes must lie inside the content box (trailing spaces may hang)
      const r = document.createRange();
      const w = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
      let ok = true;
      for (let n = w.nextNode(); n && ok; n = w.nextNode()) {
        for (const m of n.data.matchAll(/\S+/g)) {
          r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          for (const x of r.getClientRects()) if (x.width > 0 && (x.right > R + 1 || x.bottom > B + 1 || x.left < L - 1 || x.top < T - 1)) { ok = false; break; }
          if (!ok) break;
        }
      }
      box.remove();
      return ok;
    }
  };
});

const LONG = (n, fmt) => `(() => { const H = window.H; let s = ''; for (let i = 0; i < ${n}; i++) s += ${fmt}; return s; })()`;

await check('3 linked frames on 2 pages: no lost or duplicated characters, merge round-trips', `(() => {
  const { flow, san } = window.T; const H = window.H;
  let html = '';
  for (let i = 0; i < 14; i++) html += i % 3 === 0 ? '<p style="text-indent: 18px;"><span style="color: #aa0000;"><i>' + H.para(i, 40) + '</i></span></p>' : '<p>' + H.para(i, 30) + ' <b>bold ' + H.para(i + 1, 12) + '</b> tail</p>';
  html += '<ol><li>' + H.para(1, 30) + '</li><li>' + H.para(2, 30) + '</li><li>' + H.para(3, 30) + '</li></ol>';
  html = san.sanitizeHtml(html);
  const { doc, els } = H.makeDoc(html, [
    { page: 0, x: 40, y: 40, w: 320, h: 260 },
    { page: 0, x: 400, y: 40, w: 220, h: 340, style: { size: 11, spaceAfter: 4 } },
    { page: 1, x: 40, y: 40, w: 400, h: 2000, columns: 2, colGap: 16 }
  ]);
  const lay = flow.layoutStories(doc, {});
  const frags = els.map((e) => lay.get(e.id).html);
  const concat = frags.map(H.text).join('');
  if (concat !== H.text(html)) return { lost: H.text(html).length - concat.length };
  if (!frags[0] || !frags[1] || !frags[2]) return { empty: frags.map((f) => f.length) };
  if (els.some((e) => lay.get(e.id).overflow)) return 'unexpected overflow';
  const merged = flow.mergeFragments(frags);
  if (merged !== html) return { merged, html };
  for (let i = 0; i < 2; i++) if (!H.fits(doc, els[i], frags[i])) return 'fragment ' + i + ' does not fit';
  return true;
})()`);

await check('overflow flagged on the last frame; shown + overflow chars == story', `(() => {
  const { flow, san } = window.T; const H = window.H;
  let html = '';
  for (let i = 0; i < 30; i++) html += '<p><span style="color: #aa0000;"><i>' + H.para(i, 45) + '</i></span> <b>' + H.para(i, 5) + '</b></p>';
  html = san.sanitizeHtml(html);
  const { doc, els } = H.makeDoc(html, [
    { page: 0, x: 40, y: 40, w: 300, h: 200 },
    { page: 0, x: 400, y: 40, w: 200, h: 260 },
    { page: 1, x: 40, y: 40, w: 260, h: 220, columns: 2, colGap: 12 }
  ]);
  const lay = flow.layoutStories(doc, {});
  const res = els.map((e) => lay.get(e.id));
  if (res[0].overflow || res[1].overflow || !res[2].overflow) return res.map((r) => r.overflow);
  const shown = res.map((r) => H.text(r.html)).join('');
  const full = H.text(html);
  if (!full.startsWith(shown)) return 'shown text is not a prefix';
  if (shown.length + res[2].overflowChars !== full.length) return { shown: shown.length, over: res[2].overflowChars, full: full.length };
  if (flow.countOverflowChars(lay, els[2].id) !== res[2].overflowChars) return 'countOverflowChars';
  for (let i = 0; i < 3; i++) if (!H.fits(doc, els[i], res[i].html)) return 'fragment ' + i + ' does not fit';
  // formatting kept on both sides of every split
  for (let i = 1; i < 3; i++) {
    const t = document.createElement('template'); t.innerHTML = res[i].html;
    const first = t.content.firstElementChild;
    if (first.hasAttribute('data-cont')) {
      const prev = document.createElement('template'); prev.innerHTML = res[i - 1].html;
      const last = prev.content.lastElementChild;
      if (!last.hasAttribute('data-split')) return 'split part missing data-split';
      const tn = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode();
      const anc = []; for (let n = tn.parentNode; n !== first; n = n.parentNode) anc.push(n.nodeName + (n.getAttribute('style') || ''));
      const full2 = document.createElement('template'); full2.innerHTML = html;
      // the same characters in the story have the same ancestors
      const prevText = res.slice(0, i).map((r) => H.text(r.html)).join('');
      let pos = prevText.length, node = null;
      const w = document.createTreeWalker(full2.content, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { if (pos < n.data.length) { node = n; break; } pos -= n.data.length; }
      const exp = []; for (let n = node.parentNode; n.nodeName !== 'P'; n = n.parentNode) exp.push(n.nodeName + (n.getAttribute('style') || ''));
      if (JSON.stringify(anc) !== JSON.stringify(exp)) return { anc, exp };
    }
  }
  // merge of the shown fragments + nothing else is a prefix of the story structure
  return true;
})()`);

await check('splits happen at line granularity (a frame is full: the next line would not fit)', `(() => {
  const { flow } = window.T; const H = window.H;
  const html = '<p>' + H.para(3, 400) + '</p>';
  const { doc, els } = H.makeDoc(html, [{ page: 0, x: 0, y: 0, w: 260, h: 190 }, { page: 0, x: 300, y: 0, w: 260, h: 3000 }]);
  const lay = flow.layoutStories(doc, {});
  const a = lay.get(els[0].id).html, b = lay.get(els[1].id).html;
  if (!/data-cont/.test(b) || !/data-split/.test(a)) return { a, b };
  // move the first word of the continuation back: it must no longer fit
  const firstWord = H.text(b).match(/^\\S+\\s*/)[0];
  const t = document.createElement('template'); t.innerHTML = a;
  t.content.firstElementChild.append(firstWord);
  if (H.fits(doc, els[0], t.innerHTML)) return 'one more line would have fitted';
  return H.fits(doc, els[0], a) && H.text(a + b) === H.text(html);
})()`);

await check('ordered list split across frames continues numbering and merges back', `(() => {
  const { flow, san } = window.T; const H = window.H;
  let items = '';
  for (let i = 0; i < 24; i++) items += '<li>' + H.para(i, 9 + (i % 4) * 6) + '</li>';
  const html = san.sanitizeHtml('<p>Intro</p><ol start="3">' + items + '</ol><p>End</p>');
  const { doc, els } = H.makeDoc(html, [{ page: 0, w: 240, h: 230 }, { page: 0, w: 240, h: 240 }, { page: 1, w: 300, h: 1500 }]);
  const lay = flow.layoutStories(doc, {});
  const frags = els.map((e) => lay.get(e.id).html);
  if (flow.mergeFragments(frags) !== html) return { frags };
  // numbering: the visible number of every item equals its number in the story
  const numbers = [];
  for (const f of frags) {
    const t = document.createElement('template'); t.innerHTML = f;
    for (const ol of t.content.querySelectorAll('ol')) {
      let n = parseInt(ol.getAttribute('start') || '1', 10);
      for (const li of ol.children) { if (!li.hasAttribute('data-cont')) numbers.push(n); n++; }
    }
  }
  const expected = Array.from({ length: 24 }, (_, i) => i + 3);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) return { numbers };
  if (!frags[1].includes('<ol') || !/<ol[^>]*data-cont/.test(frags[1])) return { second: frags[1].slice(0, 200) };
  return true;
})()`);

await check('autofit shrink returns a scale that fits (and is close to the largest)', `(() => {
  const { flow } = window.T; const H = window.H;
  let html = ''; for (let i = 0; i < 6; i++) html += '<p>' + H.para(i, 40) + '</p>';
  const { doc, els } = H.makeDoc(html, [{ page: 0, w: 300, h: 220, autofit: 'shrink' }]);
  const r = flow.layoutStories(doc, {}).get(els[0].id);
  if (!(r.scale < 1 && r.scale >= flow.MIN_SCALE) || r.overflow) return r;
  if (H.text(r.html) !== H.text(html)) return 'text lost';
  if (!H.fits(doc, els[0], r.html, r.scale)) return 'does not fit at ' + r.scale;
  if (H.fits(doc, els[0], r.html, Math.min(1, r.scale + 0.03))) return 'scale not maximal ' + r.scale;
  // a story that fits keeps scale 1; linked frames never shrink
  const small = H.makeDoc('<p>short</p>', [{ page: 0, w: 300, h: 220, autofit: 'shrink' }]);
  if (flow.layoutStories(small.doc, {}).get(small.els[0].id).scale !== 1) return 'short scaled';
  const linked = H.makeDoc(html, [{ page: 0, w: 300, h: 120, autofit: 'shrink' }, { page: 0, w: 300, h: 120 }]);
  return flow.layoutStories(linked.doc, {}).get(linked.els[0].id).scale === 1;
})()`);

await check('autofit grow reports the content height; frame of that height has no overflow', `(() => {
  const { flow } = window.T; const H = window.H;
  let html = ''; for (let i = 0; i < 5; i++) html += '<p>' + H.para(i, 35) + '</p>';
  const g = H.makeDoc(html, [{ page: 0, w: 280, h: 60, autofit: 'grow' }]);
  const r = flow.layoutStories(g.doc, {}).get(g.els[0].id);
  if (!(r.contentHeight > 60) || H.text(r.html) !== H.text(html) || r.overflow) return r;
  const n = H.makeDoc(html, [{ page: 0, w: 280, h: r.contentHeight }]);
  const r2 = flow.layoutStories(n.doc, {}).get(n.els[0].id);
  const n2 = H.makeDoc(html, [{ page: 0, w: 280, h: r.contentHeight - 25 }]);
  const r3 = flow.layoutStories(n2.doc, {}).get(n2.els[0].id);
  return !r2.overflow && r3.overflow && Math.abs(r2.contentHeight - r.contentHeight) <= 1;
})()`);

await check('columns: text that fits in 3 columns overflows 1 column', `(() => {
  const { flow } = window.T; const H = window.H;
  let html = ''; for (let i = 0; i < 3; i++) html += '<p>' + H.para(i, 20) + '</p>';
  const c3 = H.makeDoc(html, [{ page: 0, w: 600, h: 150, columns: 3, colGap: 18 }]);
  const r = flow.layoutStories(c3.doc, {}).get(c3.els[0].id);
  const c1 = H.makeDoc(html, [{ page: 0, w: 600 / 3, h: 150 }]);
  const r1 = flow.layoutStories(c1.doc, {}).get(c1.els[0].id);
  if (r.overflow || !r1.overflow) return [r.overflow, r1.overflow];
  return H.fits(c3.doc, c3.els[0], r.html);
})()`);

await check('page fields resolve per frame; cache hit returns equal results; node-less fallback shape', `(() => {
  const { flow, fields, model } = window.T; const H = window.H;
  let html = '<p>Page ' + fields.fieldSpan('#page') + ' of ' + fields.fieldSpan('#pages') + '</p>';
  for (let i = 0; i < 10; i++) html += '<p>' + H.para(i, 30) + '</p>';
  html += '<p>Again page ' + fields.fieldSpan('#page') + '</p>';
  const { doc, els } = H.makeDoc(html, [{ page: 0, w: 300, h: 200 }, { page: 1, w: 300, h: 2000 }]);
  const resolve = (name, frame) => name === '#page' ? String(model.pageIndexOf(doc, frame.id) + 1) : name === '#pages' ? '2' : null;
  const lay = flow.layoutStories(doc, { resolveField: resolve });
  const a = lay.get(els[0].id).html, b = lay.get(els[1].id).html;
  if (!a.includes('>1</span> of <span') || !/>2<\\/span><\\/p>$/.test(b)) return { a: a.slice(0, 200), b: b.slice(-200) };
  const again = flow.layoutStories(doc, { resolveField: resolve, frames: [els[1].id] });
  if (again.get(els[1].id).html !== b || again.get(els[0].id).html !== a) return 'cache mismatch';
  const merged = flow.mergeFragments([a, b]);
  return merged === html;
})()`);

// ------------------------------------------------------------------------------------------
// richtext
// ------------------------------------------------------------------------------------------
await page.evaluate(() => {
  const ed = document.createElement('div');
  ed.id = 'ed';
  ed.contentEditable = 'true';
  ed.className = 'tx-flow';
  Object.assign(ed.style, { position: 'absolute', left: '700px', top: '20px', width: '400px', font: '16px serif' });
  document.body.appendChild(ed);
  window.R = {
    ed,
    set(html) { ed.innerHTML = html; ed.focus(); },
    /** select text by substring (first occurrence) across text nodes */
    select(sub, nth = 0) {
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      const nodes = []; let all = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, all.length]); all += n.data; }
      let idx = -1; for (let k = 0; k <= nth; k++) idx = all.indexOf(sub, idx + 1);
      const at = (pos, end) => { for (const [n, s] of nodes) if (pos < s + n.data.length || (end && pos === s + n.data.length)) return [n, pos - s]; const [n, s] = nodes[nodes.length - 1]; return [n, n.data.length]; };
      const r = document.createRange();
      const [a, ao] = at(idx, false), [b, bo] = at(idx + sub.length, true);
      r.setStart(a, ao); r.setEnd(b, bo);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return r;
    },
    caret(sub, after = true) { const r = this.select(sub); r.collapse(!after); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); },
    html() { return window.T.rt.getEditorHtml(ed); },
    selected() { return getSelection().toString(); }
  };
});

await check('toggleBold on / off and split of existing bold', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>Hello world</p>'); R.select('world'); rt.toggleBold(R.ed);
  if (R.html() !== '<p>Hello <b>world</b></p>' || R.selected() !== 'world') return [R.html(), R.selected()];
  if (!rt.getSelectionState(R.ed).bold) return 'state bold';
  rt.toggleBold(R.ed);
  if (R.html() !== '<p>Hello world</p>') return R.html();
  R.set('<p><b>abcdef</b></p>'); R.select('cd'); rt.toggleBold(R.ed);
  if (R.html() !== '<p><b>ab</b>cd<b>ef</b></p>') return R.html();
  R.select('bcde'); rt.toggleBold(R.ed);
  return R.html() === '<p><b>abcdef</b></p>' || R.html();
})()`);

await check('inline styles: font, size, colour, highlight, theme refs, nested formatting kept', `(() => {
  const { rt, san } = window.T; const R = window.R;
  const at = (sub) => { R.select(sub); const r = getSelection().getRangeAt(0); const n = r.startContainer.nodeType === 3 && r.startOffset < r.startContainer.data.length ? r.startContainer : r.endContainer; return getComputedStyle(n.parentElement); };
  R.set('<p>one <i>two three</i> four</p>');
  R.select('wo thr'); rt.setColor(R.ed, '#ff0000');
  if (R.selected() !== 'wo thr') return 'selection lost';
  if (at('wo thr').color !== 'rgb(255, 0, 0)' || at('wo thr').fontStyle !== 'italic' || at('ee').color === 'rgb(255, 0, 0)' || at('ee').fontStyle !== 'italic') return R.html();
  R.select('one two'); rt.setFontSize(R.ed, 14);
  if (at('one').fontSize !== '18.6667px' || at(' thr').fontSize === '18.6667px' || at('wo thr').color !== 'rgb(255, 0, 0)') return R.html();
  R.select('four'); rt.setFontFamily(R.ed, '@heading'); rt.setHighlight(R.ed, '@accent');
  if (!/font-family: var\\(--folio-heading\\)/.test(R.html()) || !/background-color: var\\(--folio-accent\\)/.test(R.html())) return R.html();
  const st = rt.getSelectionState(R.ed);
  if (st.fontRef !== '@heading' || st.highlight !== '@accent') return st;
  R.select('one two three four'); rt.setColor(R.ed, null); rt.setFontSize(R.ed, null);
  if (/color: #ff0000|font-size/.test(R.html())) return R.html();
  if (rt.applyInlineStyle(R.ed, 'font-size', 'javascript:x') !== false) return 'invalid accepted';
  rt.applyInlineStyle(R.ed, 'letter-spacing', '2px');
  if (!R.html().includes('letter-spacing: 2px')) return R.html();
  // output is canonical whitelisted markup
  return san.sanitizeHtml(R.ed.innerHTML) === R.html() && R.html() === san.sanitizeHtml(R.html()) || R.html();
})()`);

await check('italic/underline/strike/sub/sup toggles; sub and sup exclusive; clear formatting', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>E = mc2 and H2O</p>');
  R.select('2'); rt.toggleSuper(R.ed);
  if (R.html() !== '<p>E = mc<sup>2</sup> and H2O</p>') return R.html();
  R.select('2'); rt.toggleSub(R.ed);
  if (R.html() !== '<p>E = mc<sub>2</sub> and H2O</p>') return R.html();
  R.select('and'); rt.toggleItalic(R.ed); rt.toggleUnderline(R.ed); rt.toggleStrike(R.ed);
  const st = rt.getSelectionState(R.ed);
  if (!st.italic || !st.underline || !st.strike || st.bold) return st;
  if (!/<s><u><i>and<\\/i><\\/u><\\/s>/.test(R.html())) return R.html();
  rt.toggleUnderline(R.ed);
  if (/<u>/.test(R.html())) return R.html();
  R.select('E = mc2 and H2O'); rt.clearFormatting(R.ed);
  return R.html() === '<p>E = mc2 and H2O</p>' || R.html();
})()`);

await check('caret formatting: typing after toggleBold at a caret is bold', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>Hello world</p>'); R.caret('Hello');
  rt.toggleBold(R.ed);
  document.execCommand('insertText', false, 'BIG');
  if (R.html() !== '<p>Hello<b>BIG</b> world</p>') return R.html();
  // and off again inside bold
  R.set('<p><b>Hello world</b></p>'); R.caret('Hello');
  rt.toggleBold(R.ed);
  document.execCommand('insertText', false, 'x');
  return R.html() === '<p><b>Hello</b>x<b> world</b></p>' || R.html();
})()`);

await check('frame-level bold is overridden with font-weight: normal', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>Hello world</p>'); R.ed.style.fontWeight = '700';
  R.select('world'); rt.toggleBold(R.ed);
  const out = R.html();
  R.ed.style.fontWeight = '';
  return out === '<p>Hello <span style="font-weight: normal;">world</span></p>' || out;
})()`);

await check('paragraph style, indent and lists', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>alpha</p><p>beta</p><p>gamma</p>');
  R.select('beta'); rt.setParagraphStyle(R.ed, { align: 'center', spaceBefore: 6, lineHeight: 1.5, firstLine: 12 });
  const bp = R.ed.querySelectorAll('p')[1].style;
  if (bp.textAlign !== 'center' || bp.lineHeight !== '1.5' || bp.marginTop !== '6px' || bp.textIndent !== '12px' || !/^<p>alpha<\\/p><p style="[^"]+">beta<\\/p><p>gamma<\\/p>$/.test(R.html())) return R.html();
  if (rt.getSelectionState(R.ed).align !== 'center' || rt.getSelectionState(R.ed).lineHeight !== 1.5) return rt.getSelectionState(R.ed);
  rt.setParagraphStyle(R.ed, { align: null, spaceBefore: null, lineHeight: null, firstLine: null });
  R.select('alpha'); rt.changeIndent(R.ed, 1); rt.changeIndent(R.ed, 1);
  if (!R.html().startsWith('<p style="margin-left: 48px;">alpha</p>')) return R.html();
  rt.changeIndent(R.ed, -1); rt.changeIndent(R.ed, -1);
  R.select('alpha'); const r = R.select('alpha'); r.setEnd(R.ed.querySelectorAll('p')[1].firstChild, 2); getSelection().removeAllRanges(); getSelection().addRange(r);
  rt.toggleList(R.ed, 'ol');
  if (R.html() !== '<ol><li>alpha</li><li>beta</li></ol><p>gamma</p>') return R.html();
  if (rt.getSelectionState(R.ed).list !== 'ol') return 'state list';
  R.select('gamma'); rt.toggleList(R.ed, 'ol');
  if (R.html() !== '<ol><li>alpha</li><li>beta</li><li>gamma</li></ol>') return R.html();
  R.select('beta'); rt.toggleList(R.ed, 'ol');
  if (R.html() !== '<ol><li>alpha</li></ol><p>beta</p><ol start="2"><li>gamma</li></ol>') return R.html();
  R.select('alpha'); rt.toggleList(R.ed, 'ul');
  return R.html() === '<ul><li>alpha</li></ul><p>beta</p><ol start="2"><li>gamma</li></ol>' || R.html();
})()`);

await check('links and fields', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>visit our site today</p>');
  R.select('our site'); if (!rt.insertLink(R.ed, 'example.com')) return 'insertLink failed';
  if (R.html() !== '<p>visit <a href="https://example.com">our site</a> today</p>') return R.html();
  if (rt.getSelectionState(R.ed).link !== 'https://example.com') return 'state link';
  if (rt.insertLink(R.ed, 'javascript:alert(1)') !== false) return 'js link accepted';
  R.caret('our'); rt.removeLink(R.ed);
  if (R.html() !== '<p>visit our site today</p>') return R.html();
  R.caret('visit'); rt.insertField(R.ed, '#page');
  document.execCommand('insertText', false, '!');
  if (R.html() !== '<p>visit<span class="field" data-field="#page" contenteditable="false">«#page»</span>! our site today</p>') return R.html();
  R.select('site'); rt.insertLink(R.ed, 'me@example.org');
  return R.html().includes('<a href="mailto:me@example.org">site</a>') || R.html();
})()`);

await check('multi-paragraph inline formatting keeps blocks', `(() => {
  const { rt } = window.T; const R = window.R;
  R.set('<p>first line</p><ul><li>item one</li><li>item two</li></ul><p>last</p>');
  const r = R.select('line'); r.setEnd(R.ed.querySelectorAll('li')[1].firstChild, 4); getSelection().removeAllRanges(); getSelection().addRange(r);
  rt.toggleItalic(R.ed);
  return R.html() === '<p>first <i>line</i></p><ul><li><i>item one</i></li><li><i>item</i> two</li></ul><p>last</p>' || R.html();
})()`);

console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || errors.length ? 1 : 0);
