// Folio's icon set: 24×24 stroke icons authored for the app, installed once as an inline SVG
// sprite. icon(name) returns an <svg> that references a symbol. Features add icons with
// registry.icon(name, innerMarkup) or pass raw '<svg …>' markup wherever an icon is accepted.

import { registry } from '../registry.js';

const F = 'fill="currentColor" stroke="none"';

const ICONS = {
  // files & app
  logo: '<image href="icons/logo-mark.png" x="0" y="0" width="24" height="24"/>',
  new: '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19M12 12v6M9 15h6"/>',
  open: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h8A1.5 1.5 0 0 1 20 9.5V11"/><path d="M3 7.5v10A1.5 1.5 0 0 0 4.5 19h13.2a1.5 1.5 0 0 0 1.44-1.08L21 12H7.2a1.5 1.5 0 0 0-1.43 1.05L3.5 19"/>',
  save: '<path d="M5 3.5h11.5L20.5 7.5v11A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13.5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v4.5h8v-4.5M7 20v-6.5h10V20"/>',
  'save-as': '<path d="M5 3.5h11.5L20.5 7.5V11M11 20H5a1.5 1.5 0 0 1-1.5-1.5v-13.5A1.5 1.5 0 0 1 5 3.5"/><path d="M7.5 3.5v4.5h8v-4.5M7 20v-6.5h5"/><path d="m14 21 1-3.5 5.5-5.5 2.5 2.5-5.5 5.5z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'close-doc': '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
  recent: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  recover: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l2.5 1.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.01"/>',
  properties: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  print: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="1.5"/><path d="M7 13.5h10V21H7z"/>',
  export: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M4.5 13v5.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  download: '<path d="M12 3.5V15m-4.5-4.5L12 15l4.5-4.5M4.5 20h15"/>',
  install: '<rect x="4" y="3.5" width="16" height="12.5" rx="1.5"/><path d="M12 6.5v6m-2.5-2.5L12 12.5l2.5-2.5M8 20.5h8M12 16v4.5"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5M12 17v.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  // edit
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  copy: '<rect x="8" y="8" width="12.5" height="12.5" rx="1.5"/><path d="M16 8V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v9.5A1.5 1.5 0 0 0 5.5 16H8"/>',
  paste: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V6A1.5 1.5 0 0 1 6 4.5h2"/>',
  duplicate: '<rect x="3.5" y="3.5" width="12" height="12" rx="1.5"/><rect x="8.5" y="8.5" width="12" height="12" rx="1.5"/>',
  trash: '<path d="M3.5 6h17M8.5 6V4h7v2M18.5 6l-1 14h-11l-1-14M10 10.5v5.5M14 10.5v5.5"/>',
  'select-all': '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  pointer: '<path d="M5 3.5 18.5 12l-6 1.5-3 5.5z"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7.5-6.5 7.5-2.5 0-4-1-5.5-3.2L3 13.5a1.4 1.4 0 0 1 2.2-1.7L8 14.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.5 16.5 0 0 1-3 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.2 9.2 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'first-page': '<path d="M6 5.5v13M17 6l-6 6 6 6"/>',
  'last-page': '<path d="M18 5.5v13M7 6l6 6-6 6"/>',
  more: `<circle cx="5.5" cy="12" r="1.4" ${F}/><circle cx="12" cy="12" r="1.4" ${F}/><circle cx="18.5" cy="12" r="1.4" ${F}/>`,
  warning: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17v.01"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  // insert
  'text-box': '<rect x="3.5" y="4" width="17" height="16" rx="1.5" stroke-dasharray="2.5 2.5"/><path d="M8 9V8h8v1M12 8v8M10 16h4"/>',
  picture: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><circle cx="9" cy="9" r="1.8"/><path d="m20.5 15-5-5L4 20.5"/>',
  'picture-placeholder': '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5" stroke-dasharray="2.5 2.5"/><circle cx="9.5" cy="9.5" r="1.6"/><path d="m18 15-4-4-7 7"/>',
  'replace-picture': '<rect x="3.5" y="3.5" width="12" height="12" rx="1.5"/><path d="m15.5 11-3-3-6.5 6.5"/><path d="M19 9.5v7.5a2 2 0 0 1-2 2H9.5"/><path d="m11.5 21-2-2 2-2"/>',
  'reset-picture': '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M8 12a4 4 0 1 0 1.2-2.8"/><path d="M8 7.5v2.2h2.2"/>',
  shapes: '<rect x="3.5" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="4.5"/>',
  line: '<path d="M4 20 20 4"/>',
  'arrow-line': '<path d="M4 20 19 5M11 5h8v8"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/>',
  'page-number': '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19"/><path d="M10 13.5h4M9.5 16.5h5M11 11l-.5 7.5M14 11l-.5 7.5"/>',
  // arrange
  group: '<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="2.5 2.5"/><rect x="6.5" y="6.5" width="6" height="6" rx="1"/><rect x="11.5" y="11.5" width="6" height="6" rx="1"/>',
  ungroup: '<rect x="3.5" y="3.5" width="8" height="8" rx="1"/><rect x="12.5" y="12.5" width="8" height="8" rx="1"/><path d="M15 4h5v5M4 15v5h5" stroke-dasharray="2 2"/>',
  'bring-front': '<rect x="3" y="3" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><rect x="10" y="10" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".22"/>',
  'bring-forward': '<rect x="3" y="3" width="11" height="11" rx="1.5"/><rect x="10" y="10" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".1"/>',
  'send-backward': '<rect x="10" y="10" width="11" height="11" rx="1.5"/><rect x="3" y="3" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".1"/>',
  'send-back': '<rect x="10" y="10" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><rect x="3" y="3" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".22"/>',
  'align-left': '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="8" height="4" rx="1"/>',
  'align-center': '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="7" y="14" width="10" height="4" rx="1"/>',
  'align-right': '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="9" y="14" width="8" height="4" rx="1"/>',
  'align-top': '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="8" rx="1"/>',
  'align-middle': '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="7" width="4" height="10" rx="1"/>',
  'align-bottom': '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="8" rx="1"/>',
  'distribute-h': '<path d="M3.5 3v18M20.5 3v18"/><rect x="9" y="7" width="6" height="10" rx="1"/>',
  'distribute-v': '<path d="M3 3.5h18M3 20.5h18"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
  'flip-h': '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3.5 18H9zM15 6l5.5 12H15z"/>',
  'flip-v': '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M6 9 18 3.5V9zM6 15l12 5.5V15z"/>',
  'rotate-left': '<path d="M3.5 4v5h5"/><path d="M4 9a8.5 8.5 0 1 1 2 8.3"/>',
  'rotate-right': '<path d="M20.5 4v5h-5"/><path d="M20 9a8.5 8.5 0 1 0-2 8.3"/>',
  rotate: '<path d="M20.5 4v5h-5"/><path d="M20 9a8.5 8.5 0 1 0-2 8.3"/>',
  layers: '<path d="m12 3.5 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  arrange: '<rect x="3.5" y="3.5" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="10" height="10" rx="1.5" fill="currentColor" fill-opacity=".15"/>',
  // view
  'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  'fit-page': '<rect x="6.5" y="4.5" width="11" height="15" rx="1"/><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
  'fit-width': '<rect x="5" y="6.5" width="14" height="11" rx="1"/><path d="M2.5 12h3M18.5 12h3M4 10l-1.5 2L4 14M20 10l1.5 2-1.5 2"/>',
  'actual-size': '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 10v5M12 10.5v.01M12 14v.01M16 10v5"/>',
  ruler: '<rect x="2.5" y="7.5" width="19" height="9" rx="1.5"/><path d="M6.5 7.5v3M10 7.5v4.5M13.5 7.5v3M17 7.5v4.5"/>',
  guides: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M9 3.5v17M3.5 15h17" stroke-dasharray="2 2"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
  margins: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><rect x="7.5" y="7.5" width="9" height="9" stroke-dasharray="2 2"/>',
  columns: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M7 7.5h3.5v9H7zM13.5 7.5H17v9h-3.5z"/>',
  boundaries: '<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  snap: '<path d="M6 3.5v8a6 6 0 0 0 12 0v-8h-4v8a2 2 0 0 1-4 0v-8zM6 7.5h4M14 7.5h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  'theme-system': '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M12 4h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7z" fill="currentColor" fill-opacity=".25" stroke="none"/>',
  'panel-left': '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M9 4v16"/>',
  'panel-right': '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M15 4v16"/>',
  ribbon: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><path d="M3 15h18M3 19h12"/>',
  // pages
  page: '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19"/>',
  'page-add': '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19M12 12v6M9 15h6"/>',
  'page-duplicate': '<path d="M15 6.5H8A1.5 1.5 0 0 0 6.5 8v12A1.5 1.5 0 0 0 8 21.5h9a1.5 1.5 0 0 0 1.5-1.5V10z"/><path d="M6.5 17.5H5A1.5 1.5 0 0 1 3.5 16V4A1.5 1.5 0 0 1 5 2.5h7.5L15 5"/>',
  'page-delete': '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19M9 15h6"/>',
  'page-move': '<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3v5.5H19M12 11v7M9.5 13.5 12 11l2.5 2.5"/>',
  master: '<rect x="6" y="2.5" width="13" height="16" rx="1.5"/><path d="M5 5.5H4.5A1.5 1.5 0 0 0 3 7v13a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16 20v-.5"/><path d="M9 6.5h7M9 14.5h7"/>',
  'page-size': '<rect x="5" y="3" width="11" height="15" rx="1"/><path d="M19.5 7v14H9"/><path d="M8 7h5"/>',
  orientation: '<rect x="4" y="3" width="10" height="14" rx="1"/><rect x="9" y="12" width="12" height="8.5" rx="1" fill="currentColor" fill-opacity=".15"/>',
  portrait: '<rect x="6" y="3" width="12" height="18" rx="1.5"/>',
  landscape: '<rect x="3" y="6" width="18" height="12" rx="1.5"/>',
  facing: '<path d="M12 6.5c-2-1.7-5-2.5-8.5-2.5v14c3.5 0 6.5.8 8.5 2.5 2-1.7 5-2.5 8.5-2.5V4c-3.5 0-6.5.8-8.5 2.5zM12 6.5V20"/>',
  background: '<path d="m5 11.5 7-7 7.5 7.5-7 7a1.4 1.4 0 0 1-2 0L5 13.5a1.4 1.4 0 0 1 0-2z"/><path d="M5 12h14.5M20.5 15.5s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3z"/>',
  'color-scheme': '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.5-1.3.3-2.3 1.7-2.3H18a2.5 2.5 0 0 0 2.5-2.5c0-5.5-3.8-10-8.5-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/><circle cx="14.5" cy="7.3" r="1.2"/><circle cx="17" cy="11" r="1.2"/>',
  'font-scheme': '<path d="M3 19 8 5l5 14M4.8 14.5h6.4"/><path d="M15 12.5a2.7 2.7 0 0 1 5.5 0V19M20.5 15.5c-3.5 0-5.5.6-5.5 2s1.2 1.6 2.2 1.6c2 0 3.3-1.2 3.3-3.6"/>',
  units: '<path d="M4 18h16M4 18V15M8 18v-2M12 18v-3M16 18v-2M20 18v-3"/><path d="M7 6h10M7 6l2-2M7 6l2 2M17 6l-2-2M17 6l-2 2"/>',
  'guide-settings': '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M9 3.5v17M3.5 9h17" stroke-dasharray="2 2"/><circle cx="15" cy="15" r="2.5"/>',
  // formatting
  fill: '<path d="m5 11.5 7-7 7.5 7.5-7 7a1.4 1.4 0 0 1-2 0L5 13.5a1.4 1.4 0 0 1 0-2z"/><path d="M5 12h14.5"/>',
  outline: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  shadow: '<rect x="3.5" y="3.5" width="12" height="12" rx="1.5"/><path d="M18.5 8.5v10h-10" stroke-width="3" stroke-opacity=".4"/>',
  transparency: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5" fill="currentColor" fill-opacity=".2"/>',
  crop: '<path d="M6 2.5V18h15.5M2.5 6H18v15.5"/>',
  'text-direction': '<path d="M5 6h14M12 6v12M8 18h8"/>',
  'shape-change': '<rect x="3.5" y="11" width="9" height="9" rx="1"/><path d="M16 3.5 20.5 11h-9z"/><path d="M15.5 14h3a2 2 0 0 1 2 2v3M18.5 21.5l2-2.5 2 2.5"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  spell: '<path d="M3 15 7 5l4 10M4.4 11.5h5.2"/><path d="m12.5 15.5 3 3 6-7"/>',
  star: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2-1.8 6.5-1.8-6.5L3.5 12l6.7-2z"/>'
};

/** Names of the built-in icons. */
export const ICON_NAMES = Object.keys(ICONS);

let spriteEl = null;

/** Install (or refresh) the inline SVG sprite in the document body. */
export function installSprite() {
  const all = { ...ICONS, ...Object.fromEntries(registry.icons) };
  const symbols = Object.entries(all).map(([n, m]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${m}</symbol>`).join('');
  if (!spriteEl) {
    spriteEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    spriteEl.setAttribute('aria-hidden', 'true');
    spriteEl.setAttribute('class', 'icon-sprite');
    spriteEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.prepend(spriteEl);
    registry.on('change', (kinds) => { if (kinds.includes('icon')) installSprite(); });
  }
  spriteEl.innerHTML = `<defs>${symbols}</defs>`;
}

/** True if `name` is a known icon. */
export function hasIcon(name) {
  return !!(ICONS[name] || registry.icons.has(name));
}

/**
 * An <svg> element for an icon name, or for raw '<svg…>' markup.
 * @param {string} name
 * @param {string} [cls]
 * @returns {Element|null}
 */
export function icon(name, cls = '') {
  if (!name) return null;
  if (typeof name !== 'string') return name.cloneNode ? name.cloneNode(true) : null;
  const t = document.createElement('template');
  if (name.trim().startsWith('<')) {
    t.innerHTML = name.trim();
    const el = t.content.firstElementChild;
    if (el) el.classList.add('ic', ...cls.split(' ').filter(Boolean));
    return el;
  }
  t.innerHTML = `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  return t.content.firstElementChild;
}

/** HTML string for an icon (for template strings). */
export function iconHTML(name, cls = '') {
  if (!name) return '';
  if (name.trim().startsWith('<')) return name;
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
