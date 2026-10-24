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

// landing: a sky of slowly drifting clouds (fbm noise in a fragment shader); still when motion is reduced
(() => {
  const canvas = document.querySelector('.sky-gl');
  const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision highp float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=uv*vec2(r.x/r.y,1.)*2.4;
vec3 sky=mix(vec3(.72,.85,.98),vec3(.17,.42,.82),pow(uv.y,.8));
vec2 w=vec2(t*.018,t*.004);
float q=fbm(p*.9+w);
float c=fbm(p*1.4+vec2(q*1.6)+w*1.8);
float d=fbm(p*3.2+vec2(c)+w*2.6);
float cl=smoothstep(.42,.82,c*.8+d*.3);
float shade=smoothstep(.25,.9,d);
vec3 cloud=mix(vec3(.80,.86,.95),vec3(1.),shade);
vec3 col=mix(sky,cloud,cl*.94);
col+=vec3(1.,.97,.9)*pow(max(0.,1.-length((uv-vec2(.78,.92))*vec2(1.6,1.))),3.)*.35;
gl_FragColor=vec4(col,1.);}`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');
  const scale = Math.min(1, (devicePixelRatio || 1) * 0.6);
  const size = () => { canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale)); gl.viewport(0, 0, canvas.width, canvas.height); };
  let visible = true, raf = 0;
  const t0 = performance.now() - 40000;
  const draw = (now) => {
    raf = 0;
    gl.uniform2f(uR, canvas.width, canvas.height); gl.uniform1f(uT, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visible && !REDUCED && !document.hidden) raf = requestAnimationFrame(draw);
  };
  const start = () => { if (!raf) raf = requestAnimationFrame(draw); };
  size(); start();
  new ResizeObserver(() => { size(); start(); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
})();
