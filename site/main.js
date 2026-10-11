// Folio site: scroll reveals, nav + progress, the floating 3D book following the pointer, and the
// install buttons filled in from downloads/latest.json (written by the publish workflow).
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// reveals
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal, .reveal-zoom').forEach((el) => io.observe(el));

// nav state and progress bar
const nav = document.querySelector('.nav'), bar = document.querySelector('.progress');
const onScroll = () => {
  nav.classList.toggle('scrolled', scrollY > 20);
  bar.style.setProperty('--p', String(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// 3D book: turns toward the pointer, eased; idles with a slow sway
(() => {
  const book = document.querySelector('.book');
  if (!book || REDUCED) return;
  let tx = 0, ty = 0, x = 0, y = 0, t = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const loop = () => {
    t += 0.01;
    x += (tx - x) * 0.05; y += (ty - y) * 0.05;
    book.style.setProperty('--ry', `${-28 + x * 50 + Math.sin(t) * 6}deg`);
    book.style.setProperty('--rx', `${12 - y * 26}deg`);
    requestAnimationFrame(loop);
  };
  loop();
})();

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
    cards.forEach((c) => c.setAttribute('aria-disabled', 'true'));
    note.textContent = 'The installers are being published — check back in a few minutes.';
    return;
  }
  for (const c of cards) {
    const f = latest.files[c.dataset.file];
    if (!f) { c.setAttribute('aria-disabled', 'true'); continue; }
    c.href = `downloads/${encodeURIComponent(f.name)}`;
    c.setAttribute('download', '');
    c.querySelector('.size').textContent = `${f.name} · ${MB(f.size)}`;
  }
  note.textContent = `Free · version ${latest.version}. Pick your computer.`;
  // mark the visitor's platform (Apple silicon vs Intel cannot always be told apart)
  let pick = /Windows/i.test(navigator.userAgent) ? 'win' : /Macintosh|Mac OS X/i.test(navigator.userAgent) ? 'macArm' : null;
  if (pick === 'macArm') {
    try { const d = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['architecture']); if (d && d.architecture === 'x86') pick = 'macIntel'; } catch { /* keep */ }
  }
  if (pick) document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
})();
