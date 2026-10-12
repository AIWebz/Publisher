// File commands and File-view (backstage) pages: Open, Recent, Save, Save As, Close, Document
// Properties and Recover. (New / blank sizes are registered by the core shell.)

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { installPersistence } from '../core/persistence/index.js';
import { formatWhen, formatBytes } from '../core/persistence/format.js';
import { h } from '../core/ui/dom.js';
import { icon } from '../core/ui/icons.js';
import { plural } from '../core/i18n.js';

installPersistence({ app });

/** Leave the File view (if the shell shows it) after a document was opened. */
function closeBackstage() {
  if (app.ui.backstage && typeof app.ui.backstage.close === 'function') app.ui.backstage.close();
  else if (typeof app.closeBackstage === 'function') app.closeBackstage();
  else if (app.shell && typeof app.shell.closeBackstage === 'function') app.shell.closeBackstage();
  else app.emit('backstage', false);
}

const files = () => app.files;

// ------------------------------------------------------------------------------------------------
// Commands
// ------------------------------------------------------------------------------------------------

registry.command({
  id: 'file.open', label: 'Open', icon: 'open', shortcut: 'Mod+O', global: true, allowInText: true,
  title: 'Open a publication (.folio)',
  run: async () => { const s = await files().open(); if (s) closeBackstage(); return s; }
});

registry.command({
  id: 'file.openRecent', label: 'Open Recent', icon: 'recent', global: true,
  run: async (_ctx, entry) => { const s = await files().openRecent(entry); if (s) closeBackstage(); return s; }
});

registry.command({
  id: 'file.save', label: 'Save', icon: 'save', shortcut: 'Mod+S', allowInText: true,
  title: 'Save the publication',
  run: (ctx) => files().save(ctx.session)
});

registry.command({
  id: 'file.saveAs', label: 'Save As', icon: 'save-as', shortcut: 'Mod+Shift+S', allowInText: true,
  title: 'Save a copy under a new name or location',
  run: (ctx) => files().saveAs(ctx.session)
});

registry.command({
  id: 'file.close', label: 'Close', icon: 'close-doc', shortcut: 'Mod+W', allowInText: true,
  title: 'Close this publication',
  run: (ctx) => files().close(ctx.session)
});

registry.command({
  id: 'file.closeAll', label: 'Close All', icon: 'close-doc',
  run: () => files().closeAll()
});

registry.command({
  id: 'file.properties', label: 'Document Properties', icon: 'properties',
  title: 'Title, author, keywords and statistics',
  run: () => files().showProperties()
});

registry.command({
  id: 'file.recover', label: 'Recover Unsaved Publications', icon: 'recover', global: true,
  run: async () => { const r = await files().offerRecovery({ force: true }); if (r.length) closeBackstage(); return r; }
});

// ------------------------------------------------------------------------------------------------
// Backstage pages
// ------------------------------------------------------------------------------------------------

/** Re-render `fn` into `container` now and whenever one of `events` fires while it is shown. */
function live(container, events, fn) {
  let token = 0, seen = false;
  const draw = async () => {
    const my = ++token;
    const node = await fn();
    if (my !== token) return;
    container.replaceChildren(node);
  };
  const offs = events.map((ev) => app.on(ev, () => {
    if (container.isConnected) seen = true;
    else if (seen) { offs.forEach((off) => off()); return; }
    draw();
  }));
  draw();
  return { update: () => draw() };
}

function recentItem(entry) {
  const where = entry.path ? entry.path : entry.name;
  const open = h('button', { type: 'button', class: 'bsf-item-open', title: where, onclick: () => app.exec('file.openRecent', entry) },
    h('strong', { text: entry.title || entry.name }),
    h('span', { text: `${entry.missing ? 'Not found · ' : ''}${where}${entry.openedAt ? ` · ${formatWhen(entry.openedAt)}` : ''}` }));
  const remove = h('button', { type: 'button', class: 'danger', text: 'Remove', title: 'Remove from this list', onclick: () => files().removeRecent(entry) });
  return h('div', { class: `bsf-item${entry.missing ? ' missing' : ''}` }, icon('page'), open, h('div', { class: 'bsf-item-tools' }, remove));
}

async function recentList(limit) {
  const list = await files().recentList();
  if (!list.length) {
    return h('div', { class: 'bsf-list' }, h('div', { class: 'bsf-empty', text: app.platform.isDesktop || app.platform.hasFileHandles
      ? 'Publications you open or save appear here.'
      : 'This browser cannot reopen files by itself — use Browse to open a publication.' }));
  }
  return h('div', { class: 'bsf-list' }, list.slice(0, limit || list.length).map(recentItem));
}

registry.backstage({
  id: 'open', label: 'Open', icon: 'open', order: 20,
  render(container) {
    return live(container, ['recent', 'recovery'], async () => {
      const recover = await files().recoverable();
      return h('div', { class: 'bsf-files' },
        h('h2', { text: 'Open' }),
        h('div', { class: 'bsf-actions' },
          h('button', { type: 'button', class: 'bsf-action', onclick: () => app.exec('file.open') },
            icon('open'), h('span', {}, h('strong', { text: 'Browse…' }), h('small', { text: 'Open a .folio publication' }))),
          recover.length ? h('button', { type: 'button', class: 'bsf-action', onclick: () => app.exec('file.recover') },
            icon('recover'), h('span', {}, h('strong', { text: 'Recover unsaved' }), h('small', { text: plural(recover.length, '{n} publication not saved', '{n} publications not saved') }))) : null),
        h('p', { class: 'bsf-sub', text: 'Recent publications' }),
        await recentList(8));
    });
  }
});

registry.backstage({
  id: 'recent', label: 'Recent', icon: 'recent', order: 25,
  render(container) {
    return live(container, ['recent', 'saved'], async () => {
      const list = await files().recentList();
      return h('div', { class: 'bsf-files' },
        h('h2', { text: 'Recent' }),
        h('p', { class: 'bsf-sub', text: 'Publications you opened or saved recently.' }),
        await recentList(),
        list.length ? h('button', { type: 'button', class: 'bsf-link', text: 'Clear the recent list', onclick: async () => {
          if (await app.ui.confirm('Clear recent publications?', '<p>The files themselves are not deleted.</p>', 'Clear')) files().clearRecent();
        } }) : null);
    });
  }
});

registry.backstage({ id: 'save', label: 'Save', icon: 'save', order: 30, command: 'file.save' });
registry.backstage({ id: 'saveAs', label: 'Save As', icon: 'save-as', order: 32, command: 'file.saveAs' });

registry.backstage({
  id: 'recover', label: 'Recover', icon: 'recover', order: 70,
  render(container) {
    return live(container, ['recovery', 'sessions'], async () => {
      const list = await files().recoverable();
      const rows = list.map((e) => h('div', { class: 'bsf-item' }, icon('recover'),
        h('div', { class: 'bsf-item-open' },
          h('strong', { text: e.title || 'Untitled publication' }),
          h('span', { text: `${formatWhen(e.savedAt)} · ${plural(e.pages || 0, '{n} page', '{n} pages')}${e.size ? ` · ${formatBytes(e.size)}` : ''}${e.filePath ? ` · ${e.filePath}` : ' · never saved'}` })),
        h('div', { class: 'bsf-item-tools' },
          h('button', { type: 'button', class: 'primary', text: 'Restore', onclick: async () => { if (await files().restore(e)) { app.emit('recovery', null); closeBackstage(); } } }),
          h('button', { type: 'button', class: 'danger', text: 'Discard', onclick: async () => {
            if (await app.ui.confirm('Discard recovery copy?', `<p>The unsaved changes in “${e.title}” will be lost.</p>`, 'Discard', { danger: true })) files().discardRecovery(e);
          } }))));
      return h('div', { class: 'bsf-files' },
        h('h2', { text: 'Recover' }),
        h('p', { class: 'bsf-sub', text: 'Recovery copies are kept for publications that were not saved when Folio Publisher closed.' }),
        h('div', { class: 'bsf-list' }, rows.length ? rows : h('div', { class: 'bsf-empty', text: 'There are no unsaved publications to recover.' })));
    });
  }
});

registry.backstage({ id: 'properties', label: 'Properties', icon: 'properties', order: 80, command: 'file.properties' });
registry.backstage({ id: 'close', label: 'Close', icon: 'close-doc', order: 90, command: 'file.close' });
