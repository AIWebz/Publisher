// Extra 24×24 stroke icons used by the text tools.
import { registry } from '../../core/registry.js';

const I = {
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" stroke-width="2"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
  strike: '<path d="M16 6.5A4 4 0 0 0 12.5 5h-1a3.5 3.5 0 0 0 0 7h1a3.5 3.5 0 0 1 0 7h-1A4 4 0 0 1 8 17.5M4 12h16"/>',
  superscript: '<path d="m4 8 8 10M12 8l-8 10M15 9.5a2 2 0 1 1 3.4 1.4L15 14h4.5"/>',
  subscript: '<path d="m4 6 8 10M12 6l-8 10M15 15.5a2 2 0 1 1 3.4 1.4L15 20h4.5"/>',
  'clear-format': '<path d="M5 6V5h12v1M11 5l-3 14M6 19h5M15 14l5 5M20 14l-5 5"/>',
  'font-grow': '<path d="M3 19 8 6l5 13M5 15h6M17 11V5m-3 3h6"/>',
  'font-shrink': '<path d="M3 19 8 6l5 13M5 15h6M14 8h6"/>',
  'font-color': '<path d="m6 17 6-13 6 13M8.3 12h7.4"/>',
  highlight: '<path d="m9 11 6-6 4 4-6 6M9 11l-3 3v3h3l3-3M9 11l4 4M4 21h8"/>',
  'text-left': '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  'text-center': '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  'text-right': '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  'text-justify': '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  'line-spacing': '<path d="M11 6h10M11 12h10M11 18h10M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>',
  'list-bullet': '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  'list-number': '<path d="M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 11.5a1 1 0 0 1 2 .5L4 14h2M4 16.5h2l-1 1.5a1 1 0 1 1-1 1"/>',
  indent: '<path d="M10 6h10M10 12h10M10 18h10M3 8l3 4-3 4"/>',
  outdent: '<path d="M10 6h10M10 12h10M10 18h10M7 8l-3 4 3 4"/>',
  'text-fit': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9V8h10v1M12 8v8M10 16h4"/>',
  wrap: '<rect x="9" y="8" width="6" height="8" rx="1"/><path d="M3 5h18M3 19h18M3 9h3M3 13h3M18 9h3M18 13h3"/>',
  'link-frames': '<rect x="3" y="4" width="7" height="9" rx="1"/><rect x="14" y="11" width="7" height="9" rx="1"/><path d="M10 9h2a2 2 0 0 1 2 2v1"/>',
  unlink: '<path d="M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L20 14M8 4v2M4 8h2M16 20v-2M20 16h-2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  symbol: '<path d="M7 19h4v-2.5a6 6 0 1 1 2 0V19h4"/>',
  styles: '<path d="M4 7V5h9v2M8.5 5v12M6.5 17h4M14 12h6M17 12v7M15.5 19h3"/>',
  'change-case': '<path d="M3 18 7 7l4 11M4.5 14h5M15 11.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM17.5 11v7"/>',
  'char-spacing': '<path d="M6 15l3-9 3 9M7 12h4M15 6v9M4 19h16M4 19l2-2M4 19l2 2M20 19l-2-2M20 19l-2 2"/>',
  'va-middle': '<path d="M4 4h16M4 20h16M8 10h8M8 14h8"/>'
};
for (const [k, v] of Object.entries(I)) registry.icon(k, v);
