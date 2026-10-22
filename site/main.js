// Folio site: reveals, nav + progress, mobile menu, current section, the headline's ink plates, the
// manifesto that inks in as you read, the live text-wrap demo, the editor theme switch, and the
// download buttons filled in from downloads/latest.json (written by the publish workflow).
// The 3D models live in src/scene.js (bundled to assets/scene.js).
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// reveals: blocks rise in, headings print in; once in, hover motion runs without the stagger delay.
// A heading that prints in is fully clipped until then, so its parent block is what gets watched.
const revealed = new Map();
document.querySelectorAll('.reveal').forEach((el) => revealed.set(el, [el]));
document.querySelectorAll('.print-in').forEach((el) => revealed.set(el.parentElement, [...(revealed.get(el.parentElement) || []), el]));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const el of revealed.get(e.target) || []) {
      el.classList.add('in');
      setTimeout(() => el.classList.add('settled'), 1400);
    }
    io.unobserve(e.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
revealed.forEach((_, el) => io.observe(el));

// nav state and progress bar (batched to one write per frame)
const nav = document.querySelector('.nav'), bar = document.querySelector('.progress');
let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    nav.classList.toggle('scrolled', scrollY > 40);
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

// the headline's cyan, magenta and black plates drift slightly out of register with the pointer
(() => {
  const cover = document.querySelector('.cover'), title = document.querySelector('.cover-title');
  if (!cover || !title || REDUCED || !FINE) return;
  cover.addEventListener('pointermove', (e) => {
    const r = cover.getBoundingClientRect();
    title.style.setProperty('--mx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    title.style.setProperty('--my', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  }, { passive: true });
  cover.addEventListener('pointerleave', () => { title.style.setProperty('--mx', '0'); title.style.setProperty('--my', '0'); });
})();

// manifesto: split into words that ink in, in reading order, as the paragraph scrolls up
(() => {
  const el = document.querySelector('.read');
  if (!el) return;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of n.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) frag.append(part);
      else { const s = document.createElement('span'); s.className = 'wd'; s.textContent = part; frag.append(s); }
    }
    n.replaceWith(frag);
  }
  const words = [...el.querySelectorAll('.wd')];
  if (REDUCED) { words.forEach((w) => w.classList.add('on')); return; }
  let raf = 0, shown = -1;
  const update = () => {
    raf = 0;
    const r = el.getBoundingClientRect();
    const p = clamp((innerHeight * 0.82 - r.top) / (r.height + innerHeight * 0.3), 0, 1);
    const n = Math.round(p * words.length);
    if (n === shown) return;
    shown = n;
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
})();

// layout demo: a small text-wrap engine. The story flows line by line through two linked text boxes;
// each line is cut where it meets the picture (a circle, its square, or nothing) and justified.
(() => {
  const page = document.getElementById('demo-page');
  if (!page) return;
  const flow = page.querySelector('.flow'), pic = page.querySelector('.pic'), over = page.querySelector('.overflow');
  const link = page.querySelector('.link-line path'), status = document.getElementById('demo-status');
  const frames = [...page.querySelectorAll('.frame-box')];
  const all = page.querySelector('.story').textContent.trim().split(/\s+/);
  let words = all, fitW = 0;
  const title = document.createElement('p');
  title.className = 'page-title';
  title.setAttribute('aria-hidden', 'true');
  title.innerHTML = 'The quiet art of a garden in fall<span>The Ledger · No. 12</span>';
  page.prepend(title);
  const ctx = document.createElement('canvas').getContext('2d');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let mode = 'tight';
  const pos = { x: 0.48, y: 0.6 };
  let R = 60, raf = 0;

  const fitStory = () => {
    const placed = layout(true);
    if (placed < all.length) { words = all.slice(0, Math.max(30, placed - 12)); words[words.length - 1] = words[words.length - 1].replace(/[,.;:]?$/, '…'); }
  };
  const layout = (dry = false) => {
    if (!dry) raf = 0;
    const W = page.clientWidth, H = page.clientHeight;
    if (!W || !H) return;
    // small pages get a shortened story that fits at the start, so the overflow only shows once you crowd it
    if (W !== fitW) { fitW = W; words = all; fitStory(); }
    const cs = getComputedStyle(flow);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const lh = parseFloat(cs.lineHeight) || 22, space = ctx.measureText(' ').width;
    R = clamp(Math.min(W, H) * 0.16, 48, 96);
    pos.x = clamp(pos.x, R / W, 1 - R / W); pos.y = clamp(pos.y, R / H, 1 - R / H);
    const cx = pos.x * W, cy = pos.y * H, gap = 12;
    pic.style.width = pic.style.height = `${R * 2}px`;
    pic.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
    page.style.setProperty('--hx', `${cx}px`); page.style.setProperty('--hy', `${cy + R + 22}px`);
    // the stretch of a line [y0, y1] that the picture takes away
    const cut = (y0, y1) => {
      const rr = R + gap;
      if (mode === 'none' || y1 < cy - rr || y0 > cy + rr) return null;
      if (mode === 'square') return [cx - rr, cx + rr];
      const ny = clamp(cy, y0, y1), dx = Math.sqrt(Math.max(0, rr * rr - (ny - cy) ** 2));
      return [cx - dx, cx + dx];
    };
    const html = [];
    let wi = 0;
    const boxes = frames.map((f) => ({ x: f.offsetLeft, y: f.offsetTop, w: f.offsetWidth, h: f.offsetHeight }));
    for (const b of boxes) {
      for (let y = b.y + 8; y + lh <= b.y + b.h - 4 && wi < words.length; y += lh) {
        const x0 = b.x + 10, x1 = b.x + b.w - 10, ex = cut(y, y + lh);
        const segs = (ex ? [[x0, Math.min(x1, ex[0])], [Math.max(x0, ex[1]), x1]] : [[x0, x1]]).filter(([a, c]) => c - a > 40);
        for (const [a, c] of segs) {
          const width = c - a, line = [];
          let lw = 0;
          while (wi < words.length) {
            const w = ctx.measureText(words[wi]).width, next = line.length ? lw + space + w : w;
            if (next > width) break;
            line.push(words[wi++]); lw = next;
          }
          if (!line.length) continue;
          const extra = wi < words.length && line.length > 1 ? (width - lw) / (line.length - 1) : 0;
          html.push(`<span class="ln" style="left:${a.toFixed(1)}px;top:${y.toFixed(1)}px;word-spacing:${(extra > space * 2.6 ? 0 : extra).toFixed(2)}px">${esc(line.join(' '))}</span>`);
        }
      }
    }
    if (dry) return wi;
    flow.innerHTML = html.join('');
    const overflow = wi < words.length;
    over.classList.toggle('on', overflow);
    const last = boxes[boxes.length - 1], first = boxes[0];
    over.style.left = `${last.x + last.w - 9}px`; over.style.top = `${last.y + last.h - 9}px`;
    status.textContent = overflow ? `Text overflows by ${words.length - wi} words — move the picture to make room` : '2 linked text boxes · the story fits';
    status.classList.toggle('over', overflow);
    // the thread from the first box's out-port to the second box's in-port
    const ax = first.x + first.w, ay = first.y + first.h, bx = boxes[1].x, by = boxes[1].y;
    link.setAttribute('d', `M${ax},${ay} C${ax + 60},${ay + 40} ${bx - 60},${by - 40} ${bx},${by}`);
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => layout()); };

  // dragging (pointer) and nudging (arrow keys)
  let drag = null;
  pic.addEventListener('pointerdown', (e) => {
    const r = page.getBoundingClientRect();
    drag = { dx: e.clientX - (r.left + pos.x * r.width), dy: e.clientY - (r.top + pos.y * r.height) };
    pic.setPointerCapture(e.pointerId);
    pic.classList.add('drag'); page.classList.add('touched');
  });
  pic.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = page.getBoundingClientRect();
    pos.x = (e.clientX - drag.dx - r.left) / r.width; pos.y = (e.clientY - drag.dy - r.top) / r.height;
    queue();
  });
  const stop = () => { drag = null; pic.classList.remove('drag'); };
  pic.addEventListener('pointerup', stop); pic.addEventListener('pointercancel', stop);
  pic.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.08 : 0.025;
    pos.x += k[0] * step; pos.y += k[1] * step;
    page.classList.add('touched');
    queue();
  });
  // wrap modes (a radio group: click, or arrow keys between the options)
  const modes = [...document.querySelectorAll('[data-wrap]')];
  const choose = (b) => {
    mode = b.dataset.wrap;
    modes.forEach((m) => { m.setAttribute('aria-checked', String(m === b)); m.tabIndex = m === b ? 0 : -1; });
    queue();
  };
  modes.forEach((b, i) => {
    b.addEventListener('click', () => choose(b));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = modes[(i + d + modes.length) % modes.length];
      n.focus(); choose(n);
    });
  });
  new ResizeObserver(queue).observe(page);
  document.fonts.ready.then(queue);
  queue();
})();

// tour: dark / light editor (the 3D laptop listens for folio:theme)
document.querySelectorAll('.tour .seg button').forEach((b, _, all) => b.addEventListener('click', () => {
  all.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const theme = b.dataset.theme, src = theme === 'light' ? 'assets/editor.webp' : 'assets/editor-dark.webp';
  document.querySelectorAll('.shot, .shot-link').forEach((a) => { a.href = src; });
  document.querySelector('.shot img').src = src;
  document.dispatchEvent(new CustomEvent('folio:theme', { detail: theme }));
}));

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
    }, 900);
  };
  const skip = () => { document.dispatchEvent(new CustomEvent('folio:intro-skip')); end(); };
  document.addEventListener('folio:intro-end', end);
  document.querySelector('.intro-skip').addEventListener('click', skip);
  addEventListener('keydown', (e) => { if (!done && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(); });
  if (root.classList.contains('no-3d')) end();
  setTimeout(end, 14000);
})();

// hero: a looping film over the painting, when the page names one (data-src on .hero-video)
(() => {
  const v = document.querySelector('.hero-video');
  if (!v || !v.dataset.src || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  v.src = v.dataset.src;
  v.addEventListener('playing', () => v.closest('.hero').classList.add('has-video'), { once: true });
  v.play().catch(() => {});
})();
