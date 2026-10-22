// Folio site: reveals, the nav, the ruler (scroll position down the right edge), the screenshot and map
// tilting flat as they scroll in, downloads and the after-download toast.
'use strict';
const root = document.documentElement;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// reveals: words and pictures rise into place as they come into view (the template deck fans out)
(() => {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || REDUCED) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
})();

// nav background, the ruler's needle and section marks, and the tilts
(() => {
  const nav = document.querySelector('.nav');
  const ruler = document.querySelector('.ruler');
  const needle = ruler.querySelector('.ruler-needle');
  const marks = [...ruler.querySelectorAll('.ruler-mark')].map((m) => ({ m, el: document.getElementById(m.dataset.for) }));
  const shot = document.querySelector('.shot-frame'), plane = document.querySelector('.map-plane');
  const placeMarks = () => {
    const max = Math.max(1, root.scrollHeight - innerHeight);
    for (const { m, el } of marks) if (el) m.style.setProperty('--at', String(Math.min(1, (el.offsetTop - (el.id === 'top' ? el.offsetTop : 0)) / max)));
  };
  // eases a value from `from` to 0 as the element's top travels from the bottom of the window to `at` of its height
  const flatten = (el, from, at) => {
    if (!el || REDUCED) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * at)));
    el.style.setProperty('--tilt', `${(from * (1 - t)).toFixed(2)}deg`);
  };
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    nav.classList.toggle('scrolled', scrollY > 30);
    needle.style.setProperty('--p', String(scrollY / max));
    let current = marks[0];
    for (const x of marks) if (x.el && x.el.getBoundingClientRect().top < innerHeight * 0.45) current = x;
    marks.forEach((x) => x.m.classList.toggle('on', x === current));
    flatten(shot, 14, 0.9);
    flatten(plane, 38, 1.1);
    if (plane && !REDUCED) plane.style.setProperty('--tilt', `${Math.max(18, parseFloat(plane.style.getPropertyValue('--tilt')) || 0)}deg`);
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { placeMarks(); onScroll(); });
  addEventListener('load', () => { placeMarks(); onScroll(); });
  placeMarks(); update();
  // drag or click along the ruler to scroll
  const scale = ruler.querySelector('.ruler-scale');
  const go = (e) => { const r = scale.getBoundingClientRect(); scrollTo({ top: ((e.clientY - r.top) / r.height) * (root.scrollHeight - innerHeight), behavior: e.type === 'pointerdown' ? 'smooth' : 'instant' }); };
  scale.addEventListener('pointerdown', (e) => { go(e); scale.setPointerCapture(e.pointerId); scale.addEventListener('pointermove', go); });
  scale.addEventListener('pointerup', () => scale.removeEventListener('pointermove', go));
  scale.style.cursor = 'ns-resize';
})();

// downloads: the three tickets, plus the cover and footer buttons that go straight to the installer
// for the visitor's computer; a toast then says what to expect the first time
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
  note.textContent = `Version ${latest.version}. Pick your computer.`;
  const issue = document.querySelector('.strip-issue .v');
  if (issue) issue.textContent = latest.version;
  // the visitor's platform (iPhones and iPads also call themselves Mac; Apple silicon and Intel can
  // only be told apart in some browsers, so a Mac defaults to Apple silicon)
  const ua = navigator.userAgent;
  let pick = /Windows NT/i.test(ua) ? 'win' : /Macintosh/i.test(ua) && navigator.maxTouchPoints < 2 ? 'macArm' : null;
  if (pick === 'macArm') {
    try { const d = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['architecture']); if (d && d.architecture === 'x86') pick = 'macIntel'; } catch { /* keep */ }
  }
  const f = pick && latest.files[pick];
  if (!f) return;
  const os = pick === 'win' ? 'Windows' : 'Mac';
  document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
  document.querySelector(`.fr[data-os="${pick === 'win' ? 'win' : 'mac'}"]`)?.classList.add('mine');
  document.querySelectorAll('[data-dl]').forEach((b) => {
    b.href = `downloads/${encodeURIComponent(f.name)}`;
    b.setAttribute('download', '');
    b.dataset.file = pick;
    b.querySelector('.dl-label').textContent = `Download for ${os}`;
    b.setAttribute('aria-label', `Download Folio ${latest.version} for ${os} (${MB(f.size)})`);
  });
  const meta = document.getElementById('hero-meta');
  if (meta) meta.textContent = `Version ${latest.version} · ${MB(f.size)} · ${pick === 'win' ? 'Windows 11 or 10' : 'macOS 13+'}`;
})();

(() => {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  const text = toast.querySelector('.toast-text');
  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    toast.classList.remove('show');
    setTimeout(() => { if (!toast.classList.contains('show')) toast.hidden = true; }, 400);
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[download]');
    if (!a) return;
    const win = (a.dataset.file || '') === 'win';
    text.textContent = win
      ? 'When it finishes, open the installer. If “Windows protected your PC” appears, choose More info → Run anyway.'
      : 'When it finishes, open the .dmg and drag Folio into Applications. If macOS stops it, choose Open Anyway in System Settings → Privacy & Security.';
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(timer);
    timer = setTimeout(hide, 14000);
  });
  toast.querySelector('.toast-x').addEventListener('click', hide);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !toast.hidden) hide(); });
})();
