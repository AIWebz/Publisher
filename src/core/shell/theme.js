// Light / dark application chrome. prefs.theme is 'system' (follow the OS), 'light' or 'dark'; the
// resolved theme is set as <html data-theme> and sent to the desktop shell (title-bar overlay
// colours). Pages keep their own paper colours in both themes.

import { prefs } from '../prefs.js';
import { registry } from '../registry.js';
import { optSelect } from './options.js';

registry.optionsSection({
  page: 'general', id: 'appearance', title: 'Personalize', order: 10,
  render(box) {
    box.appendChild(optSelect('Theme', [
      { value: 'system', label: 'Use system setting' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }
    ], () => prefs.get('theme'), (v) => prefs.set('theme', v)));
  }
});

/** The theme in effect: 'light' | 'dark'. */
export function resolvedTheme() {
  const pref = prefs.get('theme');
  if (pref === 'dark' || pref === 'light') return pref;
  return globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply the theme now and whenever the preference or the OS setting changes. */
export function installTheme() {
  const root = document.documentElement;
  const apply = () => {
    const t = resolvedTheme();
    root.dataset.theme = t;
    root.classList.toggle('dark', t === 'dark');
    const d = globalThis.folioDesktop;
    if (d && d.send) d.send('app:theme', prefs.get('theme'));
  };
  prefs.on('change', (p) => { if (p === 'theme') apply(); });
  const mq = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
}
