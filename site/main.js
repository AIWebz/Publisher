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

// headline: once the accent words have risen, a slow sheen runs across them
document.querySelectorAll('.display .accent .up').forEach((el) => el.addEventListener('animationend', () => el.classList.add('done'), { once: true }));

// highlights: count up the number, scramble the words into place when they scroll in
(() => {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) return;
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const run = (el) => {
    const final = el.textContent, start = performance.now();
    const count = el.dataset.count != null ? Number(el.dataset.count) : null;
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1100);
      if (count != null) el.textContent = String(Math.round(count * (1 - Math.pow(1 - p, 3))));
      else el.textContent = [...final].map((ch, i) => (p * final.length > i + 0.5 ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      if (p < 1) requestAnimationFrame(step); else el.textContent = final;
    };
    requestAnimationFrame(step);
  };
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { run(e.target); seen.unobserve(e.target); }
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count], [data-scramble]').forEach((el) => seen.observe(el));
})();

// cards: a soft spotlight follows the pointer
document.querySelectorAll('.dl, .grid article').forEach((card) => card.addEventListener('pointermove', (e) => {
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true }));

// first-visit intro: scene.js plays it; this ends it (also when 3D is unavailable or it stalls)
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('intro-on')) return;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    try { localStorage.setItem('folio-intro', '1'); } catch { /* private mode */ }
    root.classList.add('intro-out');
    setTimeout(() => {
      root.classList.remove('intro-on', 'intro-out', 'intro-title-in');
      if (window.folioLenis) window.folioLenis.start();
      document.dispatchEvent(new CustomEvent('folio:intro-done'));
    }, 850);
  };
  const skip = () => { document.dispatchEvent(new CustomEvent('folio:intro-skip')); end(); };
  document.addEventListener('folio:intro-end', end);
  document.querySelector('.intro-skip').addEventListener('click', skip);
  addEventListener('keydown', (e) => { if (!done && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(); });
  if (root.classList.contains('no-3d')) end();
  setTimeout(end, 14000);
})();

// buttons lean toward the pointer
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.cta .btn, .foot-cta .btn, .nav-end .btn').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.16}px ${(e.clientY - r.top - r.height / 2) * 0.28}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
}

// the marquee leans with the scroll speed; the hero copy drifts up and fades as it scrolls away
(() => {
  const marquee = document.querySelector('.marquee'), hero = document.querySelector('.hero');
  let skew = 0, lastY = scrollY, raf = 0;
  const loop = () => {
    const v = scrollY - lastY;
    lastY = scrollY;
    skew += (Math.max(-12, Math.min(12, v * 0.35)) - skew) * 0.15;
    if (marquee) marquee.style.setProperty('--skew', skew.toFixed(2));
    if (hero) hero.style.setProperty('--hs', Math.min(1, Math.max(0, scrollY / hero.offsetHeight)).toFixed(3));
    raf = Math.abs(skew) > 0.02 || v !== 0 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
})();

// ideas adapted from 21st.dev components: a glow that follows the pointer, click ripples, drifting
// particles in the hero, light beams running down the install columns, and the pointer position
// (--gx / --gy) that the liquid-glass headings use for their highlight
(() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glow = document.querySelector('.cursor-glow');
  let tx = innerWidth / 2, ty = innerHeight / 3, x = tx, y = ty, raf = 0;
  const step = () => {
    x += (tx - x) * 0.14; y += (ty - y) * 0.14;
    if (glow) glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    root.style.setProperty('--gx', `${x}px`); root.style.setProperty('--gy', `${y}px`);
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(step) : 0;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX; ty = e.clientY;
    if (glow) glow.classList.add('on');
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: true });
  document.addEventListener('pointerleave', () => glow && glow.classList.remove('on'));
  if (still) return;
  addEventListener('pointerdown', (e) => {
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
    document.body.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  }, { passive: true });
  const hero = document.querySelector('.hero');
  for (let i = 0; i < 14 && hero; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.setAttribute('aria-hidden', 'true');
    p.style.cssText = `left:${(i * 37) % 97 + 1}%;top:${(i * 53) % 90 + 5}%;--pd:${6 + (i % 5)}s;--pdl:${(i * 0.45).toFixed(2)}s`;
    hero.appendChild(p);
  }
  const cols = document.querySelector('.columns');
  const tints = ['#60a5fa', '#22d3ee', '#f472b6'];
  for (let i = 0; i < 7 && cols; i++) {
    const b = document.createElement('span');
    b.className = 'beam';
    b.style.cssText = `--col:${(i * 5 + 2) % 15};--c:${tints[i % 3]};--bd:${5 + (i % 4) * 1.3}s;--bdl:${(i * 0.9).toFixed(1)}s`;
    cols.appendChild(b);
  }
})();
