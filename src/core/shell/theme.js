// Application themes (Office style): Colorful, White, Dark Gray, Black or follow the system, plus an
// accent colour. prefs.theme picks the theme ('system' | 'colorful' | 'white' | 'darkgray' | 'black';
// the older 'light'/'dark' values map to White/Black) and prefs.accent the accent. The resolved
// base ('light' | 'dark') is set as <html data-theme>, the theme as data-ui and the accent as
// data-accent; the desktop shell gets the native theme and the title-bar caption colours.
// Publication pages keep their own paper colours.

import { prefs } from '../prefs.js';
import { registry } from '../registry.js';
import { optSelect } from './options.js';

prefs.define({ accent: 'blue' });

/** Theme choices shown in Options and on the View tab. */
export const THEMES = [
  { value: 'system', label: 'Use system setting' },
  { value: 'colorful', label: 'Colorful' },
  { value: 'white', label: 'White' },
  { value: 'darkgray', label: 'Dark Gray' },
  { value: 'black', label: 'Black' }
];

/** Accent colours. */
export const ACCENTS = [
  { value: 'blue', label: 'Blue' }, { value: 'violet', label: 'Violet' }, { value: 'teal', label: 'Teal' },
  { value: 'rose', label: 'Rose' }, { value: 'amber', label: 'Amber' }, { value: 'graphite', label: 'Graphite' }
];

const systemDark = () => !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);

/** The theme in effect: 'colorful' | 'white' | 'darkgray' | 'black'. */
export function uiTheme() {
  const pref = prefs.get('theme');
  if (pref === 'light') return 'white';
  if (pref === 'dark') return 'black';
  if (THEMES.some((t) => t.value === pref) && pref !== 'system') return pref;
  return systemDark() ? 'black' : 'white';
}

/** The base in effect: 'light' | 'dark'. */
export function resolvedTheme() {
  const t = uiTheme();
  return t === 'darkgray' || t === 'black' ? 'dark' : 'light';
}

registry.optionsSection({
  page: 'general', id: 'appearance', title: 'Personalize', order: 10,
  render(box) {
    box.appendChild(optSelect('Theme', THEMES, () => (prefs.get('theme') === 'light' ? 'white' : prefs.get('theme') === 'dark' ? 'black' : prefs.get('theme')), (v) => prefs.set('theme', v)));
    box.appendChild(optSelect('Accent colour', ACCENTS, () => prefs.get('accent'), (v) => prefs.set('accent', v)));
  }
});

/** Apply the theme now and whenever the preference or the OS setting changes. */
export function installTheme() {
  const root = document.documentElement;
  const apply = () => {
    const base = resolvedTheme();
    root.dataset.theme = base;
    root.dataset.ui = uiTheme();
    root.dataset.accent = prefs.get('accent') || 'blue';
    root.classList.toggle('dark', base === 'dark');
    const d = globalThis.folioDesktop;
    if (d && d.send) {
      d.send('app:theme', base);
      requestAnimationFrame(() => {
        const cs = getComputedStyle(root);
        const color = cs.getPropertyValue('--titlebar').trim(), symbolColor = cs.getPropertyValue('--titlebar-ink').trim();
        d.send('app:titlebar', { color, symbolColor });
      });
    }
  };
  prefs.on('change', (p) => { if (p === 'theme' || p === 'accent') apply(); });
  const mq = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
}
