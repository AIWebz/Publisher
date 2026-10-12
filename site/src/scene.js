// Folio site 3D: the hero book with floating print pieces, and the laptop that opens as the
// Presentation page scrolls into view. Bundled to site/assets/scene.js by `npm run build:site`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial,
  MeshBasicMaterial, CanvasTexture, TextureLoader, SRGBColorSpace, ACESFilmicToneMapping, DirectionalLight,
  HemisphereLight, PointLight, PMREMGenerator, MathUtils
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GREEN = '#2bd96b';
const SANS = '"Geist", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (v) => 1 - Math.pow(1 - clamp01(v), 3);

// pointer, shared by both scenes (-0.5 … 0.5)
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

/** A renderer + scene + camera on a canvas that renders only while on screen and the tab is visible. */
function stage(canvas, { fov = 32, z = 10 } = {}) {
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { document.documentElement.classList.add('no-3d'); return null; }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(0, 0, z);

  let visible = false, raf = 0;
  const s = {
    renderer, scene, camera, update: null,
    frame() { if (!raf) raf = requestAnimationFrame(tick); },
    resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.5 : 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };
  const tick = (now) => {
    raf = 0;
    if (s.update) s.update(now / 1000);
    renderer.render(scene, camera);
    if (visible && !document.hidden && !REDUCED) s.frame();
  };
  s.resize();
  new ResizeObserver(() => { s.resize(); s.frame(); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) s.frame(); }, { rootMargin: '120px' }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) s.frame(); });
  return s;
}

function lights(scene, { rim = GREEN, key: k = 2.2 } = {}) {
  scene.add(new HemisphereLight('#ffffff', '#0a0a0a', 0.6));
  const key = new DirectionalLight('#ffffff', k);
  key.position.set(-4, 6, 7);
  scene.add(key);
  const back = new PointLight(rim, 40, 30, 1.6);
  back.position.set(4, 2, -4);
  scene.add(back);
  const fill = new PointLight('#ffffff', 12, 30, 1.8);
  fill.position.set(5, -3, 5);
  scene.add(fill);
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function loadImage(src) {
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}

const lines = (g, x, y, w, n, gap, color, last = 0.6) => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * gap, i === n - 1 ? w * last : w, gap * 0.38);
};

// ------------------------------------------------------------------------------------------------
// Hero: the book and the print pieces around it
// ------------------------------------------------------------------------------------------------

function bookModel(logo) {
  const W = 2, H = 2.8, D = 0.44, T = 0.05;
  const book = new Group();
  const board = new MeshStandardMaterial({ color: '#111111', roughness: 0.5, metalness: 0.25 });
  const coverTex = canvasTexture(1024, 1434, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1d1d1f'); bg.addColorStop(1, '#050505');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 2;
    for (let x = 64; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 64; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (logo) g.drawImage(logo, 112, 120, 190, 190 * logo.height / logo.width);
    g.fillStyle = '#ffffff'; g.font = `600 190px ${SANS}`;
    g.fillText('Folio', 100, 780);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `400 40px ${MONO}`;
    g.fillText('Desktop publishing', 112, 860);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(112, 1180, 800, 3);
    g.fillStyle = GREEN; g.font = `500 44px ${MONO}`;
    g.fillText('THE NEW ERA OF DESIGN', 112, 1262);
  });
  const spineTex = canvasTexture(256, 1434, (g, w, h) => {
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2 + 26, 120); g.rotate(Math.PI / 2);
    g.fillStyle = GREEN; g.font = `600 78px ${SANS}`; g.fillText('Folio', 0, 0);
    g.restore();
  });
  const stripes = (vertical) => canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.10)';
    for (let i = 0; i < 256; i += 4) vertical ? g.fillRect(i, 0, 1, h) : g.fillRect(0, i, w, 1);
  });
  const cover = new MeshStandardMaterial({ map: coverTex, roughness: 0.42, metalness: 0.2 });
  const spine = new MeshStandardMaterial({ map: spineTex, roughness: 0.45, metalness: 0.2 });
  const paper = new MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.9 });
  const edgeSide = new MeshStandardMaterial({ map: stripes(true), roughness: 0.9 });
  const edgeTop = new MeshStandardMaterial({ map: stripes(false), roughness: 0.9 });

  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const front = new Mesh(new BoxGeometry(W, H, T), [board, board, board, board, cover, board]);
  front.position.z = D / 2 + T / 2;
  const back = new Mesh(new BoxGeometry(W, H, T), board);
  back.position.z = -D / 2 - T / 2;
  const spineMesh = new Mesh(new BoxGeometry(T, H, D + 2 * T), [board, spine, board, board, board, board]);
  spineMesh.position.x = -W / 2 - T / 2;
  const pages = new Mesh(new BoxGeometry(W - 0.07, H - 0.08, D), [edgeSide, paper, edgeTop, edgeTop, paper, paper]);
  pages.position.x = -0.035;
  book.add(front, back, spineMesh, pages);
  return book;
}

function sheet(w, h, tex, back = '#f4f4f0') {
  const face = new MeshStandardMaterial({ map: tex, roughness: 0.75 });
  const plain = new MeshStandardMaterial({ color: back, roughness: 0.8 });
  return new Mesh(new BoxGeometry(w, h, 0.012), [plain, plain, plain, plain, face, plain]);
}

function flyer() {
  return sheet(1.25, 1.75, canvasTexture(500, 700, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = GREEN; g.fillRect(30, 30, w - 60, 300);
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(w - 120, 190, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0a0a'; g.font = `700 64px ${SANS}`; g.fillText('Summer', 30, 410); g.fillText('Fair', 30, 476);
    lines(g, 30, 520, w - 60, 4, 30, 'rgba(0,0,0,.35)');
    g.fillStyle = '#0a0a0a'; g.fillRect(30, h - 70, 160, 36);
  }));
}

function card() {
  return sheet(1.05, 0.62, canvasTexture(525, 310, (g, w, h) => {
    g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, w, h);
    g.fillStyle = GREEN; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#fff'; g.font = `600 44px ${SANS}`; g.fillText('Ada Park', 34, 90);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = `400 22px ${MONO}`; g.fillText('Art director', 36, 128);
    lines(g, 36, 200, 230, 3, 24, 'rgba(255,255,255,.35)', 0.8);
  }), '#0d0d0d');
}

function brochure() {
  const g = new Group();
  const panel = (i) => canvasTexture(240, 440, (c, w, h) => {
    c.fillStyle = '#f6f6f2'; c.fillRect(0, 0, w, h);
    if (i === 1) { c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, 190); c.fillStyle = GREEN; c.fillRect(20, 150, 90, 12); }
    else { c.fillStyle = 'rgba(0,0,0,.8)'; c.fillRect(20, 30, 140, 22); }
    lines(c, 20, i === 1 ? 220 : 80, w - 40, i === 1 ? 6 : 10, 26, 'rgba(0,0,0,.3)');
  });
  const P = 0.62, H = 1.14;
  const parts = [0, 1, 2].map((i) => sheet(P, H, panel(i)));
  parts[0].position.set(-P * 0.92, 0, 0.16); parts[0].rotation.y = 0.5;
  parts[2].position.set(P * 0.92, 0, 0.16); parts[2].rotation.y = -0.5;
  g.add(...parts);
  return g;
}

async function hero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const s = stage(canvas, { fov: 30, z: 10.5 });
  if (!s) return;
  await document.fonts.ready;
  const logo = await loadImage('assets/logo-white.png');
  lights(s.scene);

  const world = new Group();
  s.scene.add(world);
  const book = bookModel(logo);
  world.add(book);
  const pieces = [
    { m: flyer(), p: [1.4, 1.2, -1.5], r: [0.15, -0.5, 0.12], a: 0.12, f: 0.7 },
    { m: card(), p: [-1.3, -1.45, 1.1], r: [-0.25, 0.55, -0.18], a: 0.1, f: 0.9 },
    { m: brochure(), p: [1.25, -1.6, 0.8], r: [-0.2, -0.35, 0.05], a: 0.09, f: 0.6 }
  ];
  for (const it of pieces) { it.m.position.set(...it.p); it.m.rotation.set(...it.r); it.m.scale.setScalar(0.85); world.add(it.m); }

  const heroEl = canvas.closest('.hero');
  let px = 0, py = 0;
  s.update = (t) => {
    px += (pointer.x - px) * 0.05; py += (pointer.y - py) * 0.05;
    const scroll = heroEl ? clamp01(-heroEl.getBoundingClientRect().top / heroEl.offsetHeight) : 0;
    const sway = REDUCED ? 0 : Math.sin(t * 0.5) * 0.08;
    book.rotation.set(0.12 - py * 0.35 + scroll * 0.3, -0.5 + px * 0.6 + sway + scroll * 1.1, 0.04);
    book.position.y = REDUCED ? 0 : Math.sin(t * 0.8) * 0.08;
    world.position.y = scroll * 1.4;
    pieces.forEach((it, i) => {
      it.m.position.y = it.p[1] + (REDUCED ? 0 : Math.sin(t * it.f + i * 2) * it.a);
      it.m.rotation.y = it.r[1] + (REDUCED ? 0 : Math.sin(t * it.f * 0.6 + i) * 0.12) + px * 0.25;
      it.m.rotation.x = it.r[0] - py * 0.2;
    });
  };
  if (REDUCED) addEventListener('pointermove', () => s.frame(), { passive: true });
  // pull the camera back on tall, narrow canvases so the floating pieces stay in view
  const fit = () => {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    s.camera.position.z = Math.max(10.5, 4.3 / (2 * Math.tan(MathUtils.degToRad(s.camera.fov / 2)) * aspect));
  };
  fit();
  new ResizeObserver(fit).observe(canvas);
  s.frame();
  canvas.closest('.hero-3d')?.classList.add('ready');
}

// ------------------------------------------------------------------------------------------------
// Presentation: a laptop showing the Folio editor; the lid opens as the page scrolls
// ------------------------------------------------------------------------------------------------

function laptopModel(screenTex) {
  const g = new Group();
  const metal = new MeshStandardMaterial({ color: '#1b1b1d', metalness: 0.6, roughness: 0.42, envMapIntensity: 0.55 });
  const deckTex = canvasTexture(1024, 360, (c, w, h) => {
    c.fillStyle = '#18181a'; c.fillRect(0, 0, w, h);
    const cols = 14, rows = 5, kw = w / cols, kh = h / rows;
    c.fillStyle = '#0c0c0d';
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const wide = r === rows - 1 && k > 3 && k < 10;
      if (r === rows - 1 && k > 4 && k < 10) continue;
      c.beginPath(); c.roundRect(k * kw + 4, r * kh + 4, (wide ? kw * 6 : kw) - 8, kh - 8, 6); c.fill();
    }
  });
  const base = new Mesh(new RoundedBoxGeometry(3.4, 0.11, 2.3, 4, 0.045), metal);
  base.position.y = -0.055;
  const deck = new Mesh(new PlaneGeometry(2.86, 1.0), new MeshStandardMaterial({ map: deckTex, roughness: 0.7, metalness: 0.2 }));
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.002, -0.4);
  const pad = new Mesh(new PlaneGeometry(1.15, 0.66), new MeshStandardMaterial({ color: '#232326', roughness: 0.35, metalness: 0.5, envMapIntensity: 0.5 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.002, 0.64);
  g.add(base, deck, pad);

  const hinge = new Group();
  hinge.position.set(0, 0.02, -1.13);
  const lid = new Mesh(new RoundedBoxGeometry(3.4, 2.24, 0.06, 4, 0.025), metal);
  lid.position.set(0, 1.12, -0.03);
  const bezel = new Mesh(new PlaneGeometry(3.32, 2.16), new MeshBasicMaterial({ color: '#050505' }));
  bezel.position.set(0, 1.12, 0.0005);
  const screen = new Mesh(new PlaneGeometry(3.12, 1.95), new MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 1.14, 0.001);
  hinge.add(lid, bezel, screen);
  g.add(hinge);
  return { group: g, hinge, screen };
}

async function device() {
  const canvas = document.getElementById('device-canvas');
  if (!canvas) return;
  const s = stage(canvas, { fov: 28, z: 9 });
  if (!s) return;
  const loader = new TextureLoader();
  const load = (src) => new Promise((resolve) => loader.load(src, (t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; resolve(t); }, undefined, () => resolve(null)));
  const [dark, light] = await Promise.all([load('assets/editor-dark.webp'), load('assets/editor.webp')]);
  lights(s.scene, { rim: '#ffffff', key: 1.5 });
  const { group, hinge, screen } = laptopModel(dark);
  s.scene.add(group);
  document.addEventListener('folio:theme', (e) => {
    const tex = e.detail === 'light' ? light : dark;
    if (tex) { screen.material.map = tex; screen.material.needsUpdate = true; s.frame(); }
  });

  const track = canvas.closest('.pres-track');
  let px = 0, py = 0;
  s.update = () => {
    let p = 1;
    if (track && !REDUCED) {
      const r = track.getBoundingClientRect();
      p = clamp01(-r.top / Math.max(1, r.height - innerHeight) * 1.6 + 0.12);
    }
    px += (pointer.x - px) * 0.05; py += (pointer.y - py) * 0.05;
    const open = ease(p);
    hinge.rotation.x = MathUtils.degToRad(MathUtils.lerp(86, -14, open));
    group.rotation.set(MathUtils.lerp(0.55, 0.22, open) - py * 0.08, MathUtils.lerp(-0.7, 0, open) + px * 0.14, 0);
    group.position.set(0, MathUtils.lerp(-0.5, -1.05, open), 0);
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const near = Math.max(7.4, 4.4 / (2 * Math.tan(MathUtils.degToRad(s.camera.fov / 2)) * aspect));
    s.camera.position.z = MathUtils.lerp(near + 3, near, open);
    s.camera.lookAt(0, 0.25, 0);
  };
  if (REDUCED) addEventListener('pointermove', () => s.frame(), { passive: true });
  s.frame();
  document.documentElement.classList.add('has-3d');
}

// WebGL available? Otherwise the page keeps its flat images.
const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
if (gl) { hero(); device(); } else document.documentElement.classList.add('no-3d');
