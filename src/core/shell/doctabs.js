// Document tabs: one tab per open publication with a dirty dot and close button. Middle-click
// closes; Ctrl+Tab / Ctrl+Shift+Tab cycle (registered in features/core-edit.js).

import { app } from '../app.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';

/** Close a document tab through the Save / Don't Save / Cancel flow when available. */
export async function closeSession(s) {
  if (app.files && typeof app.files.close === 'function') return app.files.close(s);
  if (s.dirty && !(await app.ui.confirm('Close without saving?', `<b>${s.displayName}</b> has unsaved changes. Close it anyway?`, 'Close', { danger: true }))) return false;
  app.removeSession(s);
  return true;
}

/** Build the document tab strip into `el`. */
export function buildDocTabs(el) {
  el.classList.add('doctabs');
  el.setAttribute('role', 'tablist');
  el.setAttribute('aria-label', 'Open publications');
  const render = () => {
    const tabs = app.sessions.map((s) => {
      const close = h('button', { type: 'button', class: 'dt-close', 'aria-label': `Close ${s.displayName}`, onclick: (e) => { e.stopPropagation(); closeSession(s); } }, icon('close'));
      const tab = h('div', {
        class: `dt${s === app.session ? ' active' : ''}${s.dirty ? ' dirty' : ''}`, role: 'tab', tabindex: '0',
        'aria-selected': String(s === app.session), dataset: { session: s.id }
      }, h('span', { class: 'dt-ic' }, icon('page')), h('span', { class: 'dt-name', text: s.displayName }), h('span', { class: 'dt-dot', 'aria-hidden': 'true' }), close);
      setTip(tab, s.displayName, '', s.filePath || (s.fileName ? s.fileName : 'Not saved yet'));
      tab.addEventListener('click', () => app.activate(s));
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeSession(s); } });
      tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.activate(s); } });
      return tab;
    });
    const add = h('button', { type: 'button', class: 'dt-new', onclick: () => app.exec('file.new') }, icon('plus'));
    setTip(add, 'New publication', 'Ctrl+N');
    el.replaceChildren(...tabs, add);
    el.hidden = app.sessions.length === 0;
    el.querySelector('.dt.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  for (const ev of ['sessions', 'session', 'dirty', 'saved']) app.on(ev, render);
  app.on('doc-change', ({ label }) => { if (label === 'Rename Publication' || label === 'Document Properties') render(); });
  render();
  return { render };
}
