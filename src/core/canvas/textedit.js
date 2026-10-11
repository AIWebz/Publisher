// Built-in in-place text editing: the head frame of a story's chain becomes contenteditable and
// shows the whole story; edits are sanitised into doc.stories[id].html on idle, on blur and on
// commit. One editing session is one undo step ("Edit Text"). The text engine/feature extends this
// through app.on('edit-start'|'edit-end'), app.editing.root and app.textEdit.commit().

import { app } from '../app.js';
import { findElement, getChain, pageIndexOf } from '../model.js';
import { sanitizeHtml, sanitizePastedHtml, textToHtml } from '../../engines/text/sanitize.js';
import { frameExclusions, planRegion, floatsHTML } from '../../engines/text/wrap.js';

/** Wrap floats for in-place editing (single-column frames; Both sides acts as Largest side while typing). */
function editFloats(doc, frame) {
  if ((frame.columns || 1) > 1) return '';
  const p = frame.padding || { top: 4, right: 4, bottom: 4, left: 4 };
  const plan = planRegion(frameExclusions(doc, frame), (frame.w || 0) - (p.left || 0) - (p.right || 0), { bothSides: false });
  return floatsHTML(plan.floats);
}

/** Editor HTML without layout helpers. */
const editorHtml = (root) => {
  if (!root.querySelector('[data-wrapx],[data-wrapgap]')) return root.innerHTML;
  const c = root.cloneNode(true);
  c.querySelectorAll('[data-wrapx],[data-wrapgap]').forEach((n) => n.remove());
  return c.innerHTML;
};

const IDLE_MS = 600;
let editSeq = 0;

/** In-place text editor for one canvas. */
export class TextEditor {
  constructor(cv) {
    this.cv = cv;
    this.state = null;   // { frameId, storyId, root, node, key, timer }
    app.addFlusher(() => this.commit());
    app.on('doc-change', ({ session, undo, redo, reverted }) => {
      if (!this.state || session !== this.state.session) return;
      if (undo || redo || reverted) { this.abandon(); return; }
      const doc = session.doc;
      if (!findElement(doc, this.state.frameId) || !doc.stories[this.state.storyId]) this.abandon();
    });
    app.on('session', () => this.abandon());
    app.on('page', () => { if (this.state && !this.cv.nodeFor(this.state.frameId)) this.stop(); });
  }

  /** API installed as app.textEdit. */
  api() {
    return {
      start: (frameId, opts) => this.start(frameId, opts),
      stop: () => this.stop(),
      commit: () => this.commit(),
      get active() { return !!app.editing; }
    };
  }

  /**
   * Start editing the story of `frameId` (in its chain's head frame).
   * @param {string} frameId
   * @param {{ caret?: {x:number,y:number}, selectAll?: boolean }} [opts]
   */
  start(frameId, opts = {}) {
    const doc = app.doc;
    if (!doc) return false;
    const chain = getChain(doc, frameId);
    const head = chain[0];
    if (!head || head.locked) return false;
    if (this.state) this.stop();
    const story = doc.stories[head.storyId];
    if (!story) return false;
    const pi = pageIndexOf(doc, head.id);
    if (pi >= 0 && !app.isMasterMode && pi !== app.pageIndex) app.goToPage(pi);
    this.cv.render();
    const node = this.cv.nodeFor(head.id);
    const root = node && node.querySelector('.tx-flow');
    if (!root) return false;
    root.style.zoom = '';
    root.style.width = '';
    root.innerHTML = story.html || '<p><br></p>';
    if (!root.textContent && !root.querySelector('br')) root.innerHTML = '<p><br></p>';
    const floats = editFloats(doc, head);
    if (floats) { root.insertAdjacentHTML('afterbegin', floats); node.querySelector('.tx-box')?.style.setProperty('justify-content', 'flex-start'); }
    root.contentEditable = 'true';
    root.spellcheck = true;
    root.setAttribute('role', 'textbox');
    root.setAttribute('aria-multiline', 'true');
    root.setAttribute('aria-label', 'Text box');
    node.classList.add('editing');
    node.classList.remove('has-overflow');
    node.querySelectorAll('.tx-overflow').forEach((n) => n.remove());
    const st = { session: app.session, frameId: head.id, storyId: head.storyId, root, node, key: `session:text-${++editSeq}`, timer: 0, last: story.html };
    this.state = st;
    st.onInput = () => { clearTimeout(st.timer); st.timer = setTimeout(() => this.commit(), IDLE_MS); };
    st.onBlur = () => this.commit();
    st.onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.stop(); app.select([head.id]); this.cv.viewport.focus({ preventScroll: true }); }
    };
    st.onPaste = (e) => this.onPaste(e);
    root.addEventListener('input', st.onInput);
    root.addEventListener('blur', st.onBlur);
    root.addEventListener('keydown', st.onKey);
    root.addEventListener('paste', st.onPaste);
    if (!app.selectionIds.includes(head.id) || app.selectionIds.length !== 1) app.select([head.id]);
    app.setEditing({ frameId: head.id, root });
    root.focus({ preventScroll: true });
    placeCaret(root, opts);
    return true;
  }

  onPaste(e) {
    const dt = e.clipboardData;
    if (!dt) return;
    const html = dt.getData('text/html');
    const text = dt.getData('text/plain');
    if (!html && !text) return;
    e.preventDefault();
    const clean = html ? sanitizePastedHtml(html) : textToHtml(text);
    document.execCommand('insertHTML', false, clean);
  }

  /** Write the edited HTML into the story (one undo step per editing session). */
  commit() {
    const st = this.state;
    if (!st) return;
    clearTimeout(st.timer);
    if (!st.root.isConnected || app.session !== st.session) return;
    const html = sanitizeHtml(editorHtml(st.root));
    const doc = st.session.doc;
    const story = doc.stories[st.storyId];
    if (!story || story.html === html) return;
    st.last = html;
    app.transact('Edit Text', (d) => { if (d.stories[st.storyId]) d.stories[st.storyId].html = html; }, { coalesce: st.key });
  }

  /** Commit and leave editing (the frame re-renders with its flowed layout). */
  stop() {
    const st = this.state;
    if (!st) return;
    this.commit();
    this.detach(st);
    app.setEditing(null);
    this.cv.renderSoon();
  }

  /** Leave editing without committing (document replaced, undo, tab switch). */
  abandon() {
    const st = this.state;
    if (!st) return;
    clearTimeout(st.timer);
    this.detach(st);
    app.setEditing(null);
    this.cv.renderSoon();
  }

  detach(st) {
    this.state = null;
    st.root.removeEventListener('input', st.onInput);
    st.root.removeEventListener('blur', st.onBlur);
    st.root.removeEventListener('keydown', st.onKey);
    st.root.removeEventListener('paste', st.onPaste);
    st.root.contentEditable = 'false';
    st.root.removeAttribute('contenteditable');
    st.node.classList.remove('editing');
    const s = window.getSelection();
    if (s && st.root.contains(s.anchorNode)) s.removeAllRanges();
  }
}

/** Put the caret at a client point, select everything, or go to the end. */
function placeCaret(root, opts) {
  const sel = window.getSelection();
  if (!sel) return;
  let range = null;
  if (opts.caret && document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(opts.caret.x, opts.caret.y);
    if (r && root.contains(r.startContainer)) range = r;
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(root);
    if (!opts.selectAll) range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
