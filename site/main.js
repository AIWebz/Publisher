// Folio download site: scroll reveals, nav state, pointer glow, OS tabs, and download links filled in
// from downloads/latest.json (written by the publish workflow).

// ---- scroll reveals ----------------------------------------------------------------------------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .rise').forEach((el) => io.observe(el));

// ---- nav background once the page scrolls; pointer-following glow ------------------------------
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
const glow = document.querySelector('.glow');
addEventListener('pointermove', (e) => {
  glow.style.setProperty('--gx', `${(e.clientX / innerWidth) * 100}%`);
  glow.style.setProperty('--gy', `${(e.clientY / innerHeight) * 100}%`);
}, { passive: true });

// ---- install tabs (sliding pill) ---------------------------------------------------------------
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const pill = document.querySelector('.tab-pill');
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); selectTab(n); }
  });
});
const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
document.fonts?.ready.then(() => selectTab(tabs[isMac ? 1 : 0]));
selectTab(tabs[isMac ? 1 : 0]);

// ---- downloads ---------------------------------------------------------------------------------
(async () => {
  const MB = (n) => `${Math.round(n / 1048576)} MB`;
  const primary = document.getElementById('primary-download');
  const versionLine = document.getElementById('version-line');
  const note = document.getElementById('downloads-note');
  let latest = null;
  try {
    const res = await fetch('downloads/latest.json', { cache: 'no-store' });
    if (res.ok) latest = await res.json();
  } catch { /* offline or not published yet */ }

  const cards = [...document.querySelectorAll('.dl')];
  if (!latest || !latest.files) {
    for (const c of cards) c.setAttribute('aria-disabled', 'true');
    primary.textContent = 'Downloads coming soon';
    primary.setAttribute('aria-disabled', 'true');
    note.textContent = 'The installers have not been published yet.';
    return;
  }
  for (const c of cards) {
    const f = latest.files[c.dataset.file];
    if (!f) { c.setAttribute('aria-disabled', 'true'); continue; }
    c.href = `downloads/${encodeURIComponent(f.name)}`;
    c.setAttribute('download', '');
    c.querySelector('.size').textContent = `${f.name} · ${MB(f.size)}`;
  }
  versionLine.textContent = `Version ${latest.version} · free for Windows 10/11 and macOS 13 or later.`;

  // Best guess at the visitor's platform (Apple silicon vs Intel cannot always be told apart).
  let pick = null;
  if (/Windows/i.test(navigator.userAgent)) pick = 'win';
  else if (isMac) {
    pick = 'macArm';
    try {
      const d = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['architecture']);
      if (d && d.architecture === 'x86') pick = 'macIntel';
    } catch { /* keep Apple silicon */ }
  }
  const f = pick && latest.files[pick];
  if (f) {
    primary.href = `downloads/${encodeURIComponent(f.name)}`;
    primary.setAttribute('download', '');
    primary.textContent = pick === 'win' ? 'Download for Windows' : pick === 'macArm' ? 'Download for Mac' : 'Download for Mac (Intel)';
    document.querySelector(`.dl[data-file="${pick}"]`)?.classList.add('recommended');
  } else {
    primary.textContent = 'Choose your download';
  }
})();

// ================================ interactive layer ================================
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;

// scroll progress bar
const progress = document.querySelector('.progress');
const setProgress = () => progress.style.setProperty('--p', String(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
addEventListener('scroll', setProgress, { passive: true });
setProgress();

// 3D extruded type: every [data-x3d] gets a face plus stacked depth layers (per letter with data-letters)
const X3D_LAYERS = REDUCED_X3D() ? 0 : 7;
function REDUCED_X3D() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function unit(text, k, letter, depth = X3D_LAYERS) {
  if (text === ' ') return `<span class="x3d space" style="--k:${k}"></span>`;
  // deepest layer first and the face last, so the face is on top even where 3D gets flattened
  let layers = '';
  for (let z = depth; z >= 1; z--) layers += `<span class="x3d-layer" style="--z:${z}">${esc(text)}</span>`;
  const rot = letter ? ((Math.sin(k * 12.9898) * 43758.5453) % 1) * 7 : 0;   // stable pseudo-random tilt, ±7°
  return `<span class="x3d${letter ? ' letter' : ''}" style="--k:${k};--rot:${rot.toFixed(1)}deg">${layers}<span class="x3d-face">${esc(text)}</span></span>`;
}
let k3 = 0;
for (const el of document.querySelectorAll('[data-x3d]')) {
  const text = el.dataset.x3d, depth = X3D_LAYERS ? +(el.dataset.depth || X3D_LAYERS) : 0;
  if (el.hasAttribute('data-letters')) el.innerHTML = [...text].map((c) => unit(c, k3++, true, depth)).join('');
  else el.innerHTML = text.split(/( )/).filter(Boolean).map((w) => unit(w, k3++, false, depth)).join('');
}
// letters spin in 3D on hover
for (const l of document.querySelectorAll('.x3d.letter')) {
  l.addEventListener('pointerenter', () => { if (l.classList.contains('spin')) return; l.classList.add('spin'); setTimeout(() => { l.style.transition = 'none'; l.classList.remove('spin'); void l.offsetWidth; l.style.transition = ''; }, 1000); });
}

// rotating word in the eyebrow
const rot = document.querySelector('.rotator');
if (rot && !REDUCED) {
  const words = ['flyers', 'newsletters', 'brochures', 'posters', 'cards', 'menus', 'calendars', 'invitations'];
  let i = 0;
  setInterval(() => { i = (i + 1) % words.length; rot.innerHTML = `<span>${words[i]}</span>`; }, 1900);
}

// custom cursor that grows over interactive things
const cursor = document.querySelector('.cursor');
if (FINE && cursor && !REDUCED) {
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; cursor.classList.add('on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
  document.addEventListener('pointerover', (e) => cursor.classList.toggle('hover', !!e.target.closest('a, button, summary, .pic, .mock')));
  const loop = () => { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; cursor.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
  loop();
}

// magnetic buttons
if (FINE && !REDUCED) {
  for (const b of document.querySelectorAll('.magnetic')) {
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  }
  // 3D tilt
  for (const t of document.querySelectorAll('.tilt')) {
    t.addEventListener('pointermove', (e) => {
      if (!t.classList.contains('in')) return;
      const r = t.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      t.style.transform = `perspective(1400px) rotateY(${px * 7}deg) rotateX(${-py * 6}deg) scale(1.01)`;
    });
    t.addEventListener('pointerleave', () => { t.style.transform = ''; });
  }
}

// counters
const counters = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counters.unobserve(e.target);
    const end = +e.target.dataset.count, t0 = performance.now(), dur = REDUCED ? 0 : 1400;
    const step = (t) => { const k = dur ? Math.min(1, (t - t0) / dur) : 1; e.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 4))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach((el) => counters.observe(el));

// playground: drag the picture, switch wrap style and colour scheme
(() => {
  const sheet = document.querySelector('.sheet');
  if (!sheet) return;
  const body = sheet.querySelector('.sheet-body');
  const pic = sheet.querySelector('.pic');
  const bag = document.createElement('span');
  bag.className = 'bag';
  body.prepend(bag);
  const pos = { x: 0.52, y: 0.12 };   // picture position as a fraction of the free area
  const SCHEMES = [['#7b3cff', '#00e0ff'], ['#ff5a36', '#ffc046'], ['#0f7a5a', '#b6e36a'], ['#e0216b', '#ffb3cf']];
  function layout() {
    const mode = sheet.dataset.wrap;
    const W = body.clientWidth, H = sheet.clientHeight - body.offsetTop - 30;
    pic.style.cssText = ''; bag.style.cssText = '';
    const w = pic.offsetWidth, h = pic.offsetHeight;
    const x = Math.round(pos.x * Math.max(0, W - w)), y = Math.round(pos.y * Math.max(0, H - h));
    if (mode === 'none') { pic.style.left = `${x}px`; pic.style.top = `${y}px`; return; }
    if (mode === 'topbottom') {
      bag.style.cssText = `float:left;width:0;height:${y}px`;
      pic.style.cssText = `float:left;clear:left;margin:0 ${W - x - w}px .6em ${x}px`;
      return;
    }
    const side = x + w / 2 < W / 2 ? 'left' : 'right';
    bag.style.cssText = `float:${side};width:0;height:${y}px`;
    const gap = mode === 'tight' ? 'shape-outside:circle(50%);shape-margin:12px;' : '';
    pic.style.cssText = side === 'left' ? `float:left;clear:left;margin:0 16px 10px ${x}px;${gap}` : `float:right;clear:right;margin:0 ${W - x - w}px 10px 16px;${gap}`;
  }
  let drag = null;
  pic.addEventListener('pointerdown', (e) => {
    e.preventDefault(); pic.setPointerCapture(e.pointerId);
    drag = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, W: body.clientWidth - pic.offsetWidth, H: sheet.clientHeight - body.offsetTop - 30 - pic.offsetHeight };
  });
  pic.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pos.x = Math.min(1, Math.max(0, drag.x + (e.clientX - drag.sx) / Math.max(1, drag.W)));
    pos.y = Math.min(1, Math.max(0, drag.y + (e.clientY - drag.sy) / Math.max(1, drag.H)));
    layout();
  });
  pic.addEventListener('pointerup', () => { drag = null; });
  pic.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] }[e.key];
    if (!d) return;
    e.preventDefault(); pos.x = Math.min(1, Math.max(0, pos.x + d[0])); pos.y = Math.min(1, Math.max(0, pos.y + d[1])); layout();
  });
  const radios = (sel, apply) => {
    const btns = [...document.querySelectorAll(sel)];
    btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute('aria-checked', String(x === b))); apply(b); }));
  };
  radios('.seg [data-wrap]', (b) => { sheet.dataset.wrap = b.dataset.wrap; layout(); });
  radios('.swatches [data-scheme]', (b) => { const [c1, c2] = SCHEMES[+b.dataset.scheme]; sheet.style.setProperty('--c1', c1); sheet.style.setProperty('--c2', c2); });
  addEventListener('resize', layout);
  document.fonts?.ready.then(layout);
  layout();
})();

// pinned horizontal showcase
(() => {
  const sec = document.querySelector('.showcase'), track = document.querySelector('.showcase-track');
  if (!sec || !track) return;
  const pinned = () => getComputedStyle(document.querySelector('.showcase-pin')).position === 'sticky';
  const update = () => {
    if (!pinned()) { track.style.transform = ''; return; }
    const r = sec.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    const max = Math.max(0, track.scrollWidth - innerWidth + 80);
    track.style.transform = `translateX(${-k * max}px)`;
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
})();

// headline and logo follow the pointer in 3D
(() => {
  const head = document.querySelector('.x3d-head'), mark = document.querySelector('.mark3d');
  if (!head || REDUCED) return;
  let tx = 0, ty = 0, x = 0, y = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const loop = () => {
    x += (tx - x) * 0.06; y += (ty - y) * 0.06;
    if (scrollY < innerHeight * 1.2) {
      head.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 16}deg)`;
      if (mark) mark.style.transform = `rotateY(${x * 40}deg) rotateX(${-y * 30}deg)`;
    }
    requestAnimationFrame(loop);
  };
  loop();
})();

// giant word turns in 3D as the section scrolls past
(() => {
  const sec = document.querySelector('.spin-sec'), word = document.querySelector('.spin-word');
  if (!sec || !word) return;
  const update = () => {
    if (getComputedStyle(word.parentElement).position !== 'sticky') { word.style.transform = ''; return; }
    const r = sec.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    word.style.transform = `rotateY(${-48 + k * 96}deg) rotateX(${22 - k * 44}deg) rotateZ(${-6 + k * 12}deg) scale(${0.72 + Math.sin(k * Math.PI) * 0.38})`;
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
})();
