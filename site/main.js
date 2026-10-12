// Folio site: scroll reveals, nav + progress, mobile menu, current section, the editor theme switch,
// and the install buttons filled in from downloads/latest.json (written by the publish workflow).
// The 3D models live in src/scene.js (bundled to assets/scene.js).

// reveals
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// nav state and progress bar (batched to one write per frame)
const nav = document.querySelector('.nav'), bar = document.querySelector('.progress');
let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    nav.classList.toggle('scrolled', scrollY > 20);
    bar.style.setProperty('--p', String(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
  });
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// mobile menu
const menu = document.querySelector('.menu');
const setMenu = (open) => {
  nav.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
};
menu.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menu.focus(); } });

// current section in the nav
const links = new Map([...nav.querySelectorAll('nav a')].map((a) => [a.hash.slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach((a) => a.removeAttribute('aria-current'));
    links.get(e.target.id)?.setAttribute('aria-current', 'true');
  }
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));

// presentation: dark / light editor (the 3D laptop listens for folio:theme)
document.querySelectorAll('.seg button').forEach((b, _, all) => b.addEventListener('click', () => {
  all.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const theme = b.dataset.theme, src = theme === 'light' ? 'assets/editor.webp' : 'assets/editor-dark.webp';
  document.querySelectorAll('.shot, .shot-link').forEach((a) => { a.href = src; });
  document.querySelector('.shot img').src = src;
  document.dispatchEvent(new CustomEvent('folio:theme', { detail: theme }));
}));

// install buttons
(async () => {
  const MB = (n) => `${Math.round(n / 1048576)} MB`;
  const note = document.getElementById('downloads-note');
  let latest = null;
  try {
    const res = await fetch('downloads/latest.json', { cache: 'no-store' });
    if (res.ok) latest = await res.json();
  } catch { /* not published yet */ }
  const cards = [...document.querySelectorAll('.dl')];
  if (!latest || !latest.files) {
    cards.forEach((c) => { c.setAttribute('aria-disabled', 'true'); c.tabIndex = -1; });
    note.textContent = 'The installers are being published — check back in a few minutes.';
    return;
  }
  for (const c of cards) {
    const f = latest.files[c.dataset.file];
    if (!f) { c.setAttribute('aria-disabled', 'true'); c.tabIndex = -1; continue; }
    c.href = `downloads/${encodeURIComponent(f.name)}`;
    c.setAttribute('download', '');
    c.querySelector('.size').textContent = `${MB(f.size)} · ${f.name}`;
    c.setAttribute('aria-label', `Download Folio ${latest.version} for ${c.querySelector('.dl-os').textContent} (${MB(f.size)})`);
  }
  note.textContent = `Free · version ${latest.version}. Pick your computer.`;
  document.getElementById('pill-text').textContent = `Folio ${latest.version} for Windows & Mac`;
  // mark the visitor's platform (Apple silicon vs Intel cannot always be told apart)
  let pick = /Windows/i.test(navigator.userAgent) ? 'win' : /Macintosh|Mac OS X/i.test(navigator.userAgent) ? 'macArm' : null;
  if (pick === 'macArm') {
    try { const d = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['architecture']); if (d && d.architecture === 'x86') pick = 'macIntel'; } catch { /* keep */ }
  }
  if (pick) document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
})();
