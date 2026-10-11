// The feature registry: commands, ribbon tabs/groups, inspector sections, element types,
// backstage pages, preflight checks, context-menu providers, keyboard shortcuts and icons.
// Features register here; the core shell renders whatever is registered (see ARCHITECTURE.md).

import { Emitter } from './events.js';
import { normalizeCombo } from './shortcuts.js';

/** Canonical ids of the built-in ribbon tabs. */
export const TABS = Object.freeze({
  home: 'home', insert: 'insert', pageDesign: 'pageDesign', mailings: 'mailings', review: 'review', view: 'view',
  textFormat: 'textFormat', pictureFormat: 'pictureFormat', shapeFormat: 'shapeFormat', tableDesign: 'tableDesign', tableLayout: 'tableLayout'
});

// Tolerant tab-id matching: "page-design", "Page Design", "design" all address the Page Design tab.
const TAB_ALIASES = {
  design: 'pagedesign', page: 'pagedesign', pagesetup: 'pagedesign',
  mailing: 'mailings', mailmerge: 'mailings', mail: 'mailings',
  text: 'textformat', textbox: 'textformat', textboxtools: 'textformat', textboxformat: 'textformat', texttools: 'textformat',
  textboxtoolsformat: 'textformat', textframe: 'textformat',
  picture: 'pictureformat', picturetools: 'pictureformat', image: 'pictureformat', imageformat: 'pictureformat', picturetoolsformat: 'pictureformat',
  shape: 'shapeformat', shapes: 'shapeformat', drawing: 'shapeformat', drawingtools: 'shapeformat', drawingformat: 'shapeformat', drawingtoolsformat: 'shapeformat',
  table: 'tabledesign', tabletools: 'tabledesign', tabletoolsdesign: 'tabledesign',
  tabletoolslayout: 'tablelayout'
};

/** Normalise a tab id for matching ("Page-Design" -> "pagedesign", alias-resolved). */
export function tabKey(id) {
  const k = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return TAB_ALIASES[k] || k;
}

const byOrder = (a, b) => (a.order ?? 100) - (b.order ?? 100) || (a._seq - b._seq);
let seq = 0;

/** The registry singleton's class. */
export class Registry extends Emitter {
  constructor() {
    super();
    this.commands = new Map();
    this.tabs = new Map();          // tabKey -> tab
    this.groups = new Map();        // `${tabKey}/${id}` -> group
    this.inspectors = new Map();
    this.elementTypes = new Map();
    this.backstages = new Map();
    this.preflights = new Map();
    this.contextMenus = new Map();
    this.shortcuts = new Map();     // canonical combo -> command id
    this.icons = new Map();         // icon name -> svg inner markup
    this.optionsPages = new Map();  // File › Options categories
    this.optionsSections = new Map();
    this._pending = new Set();
    this._flushQueued = false;
  }

  _changed(kind) {
    this._pending.add(kind);
    if (this._flushQueued) return;
    this._flushQueued = true;
    queueMicrotask(() => {
      this._flushQueued = false;
      const kinds = [...this._pending];
      this._pending.clear();
      this.emit('change', kinds);
    });
  }

  /**
   * Register a command. { id, label, icon, shortcut, title?, run(ctx, arg), enabled?(ctx), checked?(ctx), labelFor?(ctx) }
   * `shortcut` may be a string or an array of strings.
   */
  command(def) {
    if (!def || !def.id || typeof def.run !== 'function') throw new Error('registry.command needs { id, run }');
    const prev = this.commands.get(def.id);
    const cmd = { ...def, _seq: prev ? prev._seq : seq++ };
    this.commands.set(def.id, cmd);
    const list = def.shortcut ? (Array.isArray(def.shortcut) ? def.shortcut : [def.shortcut]) : [];
    for (const s of list) this.shortcut(s, def.id);
    this._changed('command');
    return cmd;
  }

  /** Register a ribbon tab. { id, label, order, contextual?(ctx) -> bool, accent?, caption? } */
  tab(def) {
    if (!def || !def.id) throw new Error('registry.tab needs { id }');
    const key = tabKey(def.id);
    const prev = this.tabs.get(key);
    this.tabs.set(key, { ...(prev || {}), ...def, id: prev ? prev.id : def.id, key, _seq: prev ? prev._seq : seq++ });
    this._changed('tab');
  }

  /** Register a ribbon group. { tab, id, label, order, items: Item[] } (re-registering replaces). */
  group(def) {
    if (!def || !def.tab || !def.id) throw new Error('registry.group needs { tab, id }');
    const key = `${tabKey(def.tab)}/${def.id}`;
    const prev = this.groups.get(key);
    const items = (def.items || []).map((it) => (typeof it === 'string' ? { command: it, size: 'small' } : it));
    this.groups.set(key, { ...def, items, tabKey: tabKey(def.tab), _seq: prev ? prev._seq : seq++ });
    this._changed('group');
  }

  /** Register an inspector (Format pane) section. { id, title, order, when(ctx), render(container, ctx) -> { update(ctx) } } */
  inspector(def) {
    if (!def || !def.id || typeof def.render !== 'function') throw new Error('registry.inspector needs { id, render }');
    const prev = this.inspectors.get(def.id);
    this.inspectors.set(def.id, { ...def, _seq: prev ? prev._seq : seq++ });
    this._changed('inspector');
  }

  /**
   * Register (or extend) an element type. { label, render(node, el, rctx), onDoubleClick?(el, ctx), hitTest? }
   * Registering an existing type merges the new properties over the old ones.
   */
  elementType(type, def) {
    const prev = this.elementTypes.get(type) || {};
    this.elementTypes.set(type, { ...prev, ...def, type });
    this._changed('elementType');
  }

  /** Register a File (backstage) page or action. { id, label, icon, order, render?(container, ctx), command? } */
  backstage(def) {
    if (!def || !def.id) throw new Error('registry.backstage needs { id }');
    const prev = this.backstages.get(def.id);
    this.backstages.set(def.id, { ...def, _seq: prev ? prev._seq : seq++ });
    this._changed('backstage');
  }

  /** Register a File › Options category. { id, label, order, icon? } */
  optionsPage(def) {
    if (!def || !def.id) throw new Error('registry.optionsPage needs { id }');
    const prev = this.optionsPages.get(def.id);
    this.optionsPages.set(def.id, { ...(prev || {}), ...def, _seq: prev ? prev._seq : seq++ });
    this._changed('options');
  }

  /**
   * Register a section of a File › Options category.
   * { page, id, title?, order, render(container, ctx) -> { update?(), destroy?() }? }
   */
  optionsSection(def) {
    if (!def || !def.page || !def.id || typeof def.render !== 'function') throw new Error('registry.optionsSection needs { page, id, render }');
    const key = `${def.page}/${def.id}`;
    const prev = this.optionsSections.get(key);
    this.optionsSections.set(key, { ...def, _seq: prev ? prev._seq : seq++ });
    this._changed('options');
  }

  /** Register a preflight (design checker) check. { id, label, check(doc) -> Issue[] } */
  preflight(def) {
    if (!def || !def.id || typeof def.check !== 'function') throw new Error('registry.preflight needs { id, check }');
    this.preflights.set(def.id, { ...def, _seq: seq++ });
    this._changed('preflight');
  }

  /** Register a context-menu provider. { id, order, items(ctx) -> MenuItem[] } */
  contextMenu(def) {
    if (!def || !def.id || typeof def.items !== 'function') throw new Error('registry.contextMenu needs { id, items }');
    const prev = this.contextMenus.get(def.id);
    this.contextMenus.set(def.id, { ...def, _seq: prev ? prev._seq : seq++ });
    this._changed('contextMenu');
  }

  /** Bind a keyboard shortcut ("Mod+Shift+L") to a command id. Later bindings win. */
  shortcut(combo, commandId) {
    this.shortcuts.set(normalizeCombo(combo), commandId);
    this._changed('shortcut');
  }

  /** Add an icon to the sprite: name -> inner SVG markup for a 24×24 viewBox (stroke-based). */
  icon(name, markup) {
    this.icons.set(name, markup);
    this._changed('icon');
  }

  // ---------------------------------------------------------------- queries

  getCommand(id) { return this.commands.get(id) || null; }

  /** Tabs sorted by order. */
  tabList() { return [...this.tabs.values()].sort(byOrder); }

  getTab(id) { return this.tabs.get(tabKey(id)) || null; }

  /** Groups of a tab sorted by order. */
  groupsFor(tabId) {
    const k = tabKey(tabId);
    return [...this.groups.values()].filter((g) => g.tabKey === k).sort(byOrder);
  }

  inspectorList() { return [...this.inspectors.values()].sort(byOrder); }
  backstageList() { return [...this.backstages.values()].sort(byOrder); }
  preflightList() { return [...this.preflights.values()].sort(byOrder); }
  contextMenuList() { return [...this.contextMenus.values()].sort(byOrder); }
  optionsPageList() { return [...this.optionsPages.values()].sort(byOrder); }
  optionsSectionsFor(page) { return [...this.optionsSections.values()].filter((s) => s.page === page).sort(byOrder); }
  getElementType(type) { return this.elementTypes.get(type) || null; }

  /** Command id bound to a canonical combo, or null. */
  commandForCombo(combo) { return this.shortcuts.get(combo) || null; }

  /** First shortcut combo bound to a command (canonical form), or null. */
  shortcutFor(commandId) {
    for (const [combo, id] of this.shortcuts) if (id === commandId) return combo;
    return null;
  }
}

/** The application-wide registry. */
export const registry = new Registry();
