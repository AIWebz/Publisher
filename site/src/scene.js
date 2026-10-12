// Folio site 3D. One WebGL canvas fixed over the page renders every model into the rectangle of its
// host element (scissored views), so a dozen models cost one context. Views render only while on
// screen; under prefers-reduced-motion they render still frames on demand.
// Bundled to site/assets/scene.js by `npm run build:site`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, PlaneGeometry, CylinderGeometry, MeshStandardMaterial, MeshBasicMaterial,
  TextureLoader, SRGBColorSpace, NeutralToneMapping, MathUtils, WebGLRenderTarget, HalfFloatType
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { studioLights, roomEnvironment, mat, contactShadow, damp, clamp01, easeOut, easeInOut, stagger } from './models/kit.js';
import * as M from './models/objects.js';
import Lenis from 'lenis';
import { buildIntro, disposeScene } from './intro.js';
import { buildGlassText, wrapWords } from './glasstext.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

// smooth, inertial wheel scrolling (touch keeps native scrolling; off under reduced motion)
if (!REDUCED) {
  const lenis = new Lenis({ lerp: 0.085, anchors: { offset: -76 }, autoRaf: true });
  window.folioLenis = lenis;
  if (root.classList.contains('intro-on')) lenis.stop();
}

let renderer;
try {
  const ok = (() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); })();
  if (!ok) throw new Error('no webgl');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  root.classList.add('no-3d');
}

if (renderer) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false; // views may overlap (the glass headline over the hero), so each clears only depth
  const env = roomEnvironment(renderer);
  const canvas = renderer.domElement;
  const views = [];
  let raf = 0, last = 0, W = 0, H = 0;

  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, W < 700 ? 1.5 : 2));
    renderer.setSize(W, H, false);
  };
  const frame = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function tick(now) {
    raf = 0;
    if (W !== canvas.clientWidth || H !== canvas.clientHeight) resize();
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const t = REDUCED ? 6 : now / 1000;
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    let live = false;
    const introOn = root.classList.contains('intro-on');
    for (const v of views) {
      if (!v.visible || !v.update || !!v.isIntro !== introOn) continue;
      const r = v.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width < 2 || r.height < 2) continue;
      live = true;
      if (v.start == null) v.start = t;
      v.hover = REDUCED ? 0 : damp(v.hover, v.hoverTarget, 10, dt);
      const enter = REDUCED ? 1 : easeInOut((t - v.start - v.delay) / v.intro);
      const scroll = MathUtils.clamp((r.top + r.height / 2 - H / 2) / (H / 2 + r.height / 2), -1, 1);
      v.update(t, { dt, hover: v.hover, enter, scroll }, r);
      v.camera.aspect = r.width / r.height;
      v.camera.updateProjectionMatrix();
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.clearDepth();
      renderer.render(v.scene, v.camera);
      if (v.after) v.after(r);
      if (!REDUCED && enter < 1) live = true;
    }
    if (live && !REDUCED && !document.hidden) frame();
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { const v = views.find((x) => x.el === e.target); if (v) v.visible = e.isIntersecting; }
    frame();
  }, { rootMargin: '80px 0px' });

  /** Register a view: build() adds models to the scene and returns update(t, s, rect). */
  function view(el, { fov = 30, cam = [0, 0.6, 6.5], look = [0, 0, 0], hoverEl = el, intro = 1.6, delay = 0, lights } = {}, build) {
    if (!el) return;
    const scene = new Scene();
    scene.environment = env;
    studioLights(scene, lights);
    const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
    camera.position.set(...cam);
    camera.lookAt(...look);
    const v = { el, scene, camera, visible: false, hover: 0, hoverTarget: 0, update: null, start: null, intro, delay };
    views.push(v);
    io.observe(el);
    const on = () => { v.hoverTarget = 1; frame(); }, off = () => { v.hoverTarget = 0; frame(); };
    hoverEl.addEventListener('pointerenter', on); hoverEl.addEventListener('pointerleave', off);
    hoverEl.addEventListener('focusin', on); hoverEl.addEventListener('focusout', off);
    Promise.resolve(build(scene, camera, v)).then((update) => { v.update = update; frame(); });
  }

  // ---------------------------------------------------------------------------------------------
  // Hero: the book sits behind the glass headline with print pieces, a swatch fan and a pencil
  // around it. The scene is also drawn into a texture that the headline's glass refracts.
  // ---------------------------------------------------------------------------------------------
  const heroEl = document.querySelector('.hero-3d');
  const heroH1 = document.querySelector('.hero .display');
  const behind = { texture: null, rect: null };
  view(heroEl, { fov: 30, cam: [0, 0, 12], hoverEl: heroEl && heroEl.closest('.hero'), intro: 2.2, delay: 0.25 }, async (scene, camera, v) => {
    const world = new Group();
    scene.add(world);
    // [make, [u, v] in half-sizes of the headline box from its centre, z, rotation, scale × book, depth]
    const items = await Promise.all([
      [M.createBook, [0.04, 0.02], -0.4, [0, 0, 0], 1, 0],
      [M.createFlyer, [-0.8, 0.24], -1.6, [0.15, 0.5, -0.1], 0.78, 0.5],
      [M.createBrochure, [0.84, -0.26], -1.3, [-0.2, -0.45, 0.06], 0.84, 0.6],
      [M.createSwatchFan, [-1.25, 1.2], 0.4, [0.1, 0.4, 0.25], 0.58, 0.8],
      [M.createCard, [1.22, -1.3], 0.8, [-0.25, -0.5, -0.18], 0.78, 0.9],
      [M.createPencil, [-1.1, -1.32], 1.0, [0.4, 0.3, 0.95], 0.64, 1.2]
    ].map(async ([make, uv, z, r, scale, depth], i) => {
      const m = await make();
      const holder = new Group();
      holder.add(m.object);
      world.add(holder);
      return { m, holder, uv, z, r, scale, depth, i };
    }));
    const rt = new WebGLRenderTarget(2, 2, { type: HalfFloatType });
    behind.texture = rt.texture;
    v.after = (r) => {
      const k = Math.min(1, devicePixelRatio) * 0.75;
      const w = Math.max(2, Math.round(r.width * k)), h = Math.max(2, Math.round(r.height * k));
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      behind.rect = r;
    };
    const n = items.length, tan = Math.tan(MathUtils.degToRad(15));
    let px = 0, py = 0;
    return (t, s, rect) => {
      px = damp(px, pointer.x, 4, s.dt); py = damp(py, pointer.y, 4, s.dt);
      // world units per CSS px on the z = 0 plane, and the headline box in world units
      const Z = camera.position.z, kpx = (2 * Z * tan) / rect.height;
      const halfW = Z * tan * (rect.width / rect.height), halfH = Z * tan;
      const h = heroH1 ? heroH1.getBoundingClientRect() : { left: rect.left + rect.width * 0.2, top: rect.top + rect.height * 0.3, width: rect.width * 0.6, height: rect.height * 0.3 };
      const cx = (h.left + h.width / 2 - rect.left - rect.width / 2) * kpx, cy = -(h.top + h.height / 2 - rect.top - rect.height / 2) * kpx;
      const hx = (h.width / 2) * kpx, hy = (h.height / 2) * kpx;
      const book = Math.min((hy * 2 * 0.84) / 2.8, (hx * 2 * 0.36) / 2);
      const out = Math.max(0, -s.scroll); // 0 at rest, grows as the hero scrolls away
      for (const it of items) {
        const e = it.i === 0 ? s.enter : stagger(s.enter, it.i, n, 0.55);
        const k = easeOut(e);
        // fly in from further out, drift apart while scrolling away, parallax by depth
        const spread = 1 + (1 - k) * 0.9 + out * 0.9;
        const x = MathUtils.clamp(cx + it.uv[0] * hx * spread, -halfW * 0.84, halfW * 0.84);
        const y = MathUtils.clamp(cy + it.uv[1] * hy * spread, -halfH * 0.86, halfH * 0.7); // clear of the nav
        it.holder.position.set(x + px * it.depth * 0.5, y - py * it.depth * 0.35 + (it.i ? Math.sin(t * 0.8 + it.i * 2) * 0.08 : 0), it.z - (1 - k) * 2);
        it.holder.rotation.set(it.r[0] - py * 0.2 * it.depth, it.r[1] + px * 0.5 * (it.depth || 0.5) + (it.i ? Math.sin(t * 0.5 + it.i) * 0.12 : 0) + out * it.i * 0.3, it.r[2]);
        it.holder.scale.setScalar(book * it.scale * (it.i ? k : 1));
        it.holder.visible = it.i === 0 || k > 0.001;
        if (it.m.update) it.m.update(t, { dt: s.dt, hover: it.i === 0 ? s.hover : 0, enter: e, scroll: s.scroll });
      }
      world.rotation.y = px * 0.08;
    };
  });

  // ---------------------------------------------------------------------------------------------
  // Headings: real 3D glass letters over the (transparent) HTML headings (see glasstext.js)
  // ---------------------------------------------------------------------------------------------
  const headings = [...document.querySelectorAll('.display, main .h2, .foot-cta .h2')];
  if (headings.length) root.classList.add('glass3d');
  headings.forEach((el, i) => {
    wrapWords(el);
    el.classList.add('gl-on');
    const stageEl = document.createElement('div');
    stageEl.className = 'glass-stage';
    stageEl.setAttribute('aria-hidden', 'true');
    el.appendChild(stageEl);
    const hero = el.closest('.hero');
    view(stageEl, { fov: 22, hoverEl: el, intro: hero ? 1.9 : 1.5, delay: hero ? 0.15 : 0.05 }, (scene, camera) => {
      const glassText = buildGlassText(scene, camera, el, {
        mobile: innerWidth < 700, area: hero || el.closest('.head, .foot-cta') || el.parentElement, grid: !!hero, behind: hero ? behind : null
      });
      document.fonts.ready.then(() => { glassText.rebuild(); frame(); });
      return (t, s, rect) => glassText.update(t, { ...s, pointer }, rect);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Install: a device in each card
  // ---------------------------------------------------------------------------------------------
  const devices = { win: M.createMonitor, macArm: M.createLaptopSilver, macIntel: M.createLaptopGraphite };
  document.querySelectorAll('.dl').forEach((card, i) => {
    const make = devices[card.dataset.file];
    view(card.querySelector('.dl-model'), { fov: 26, cam: [0, 1.1, 7.2], look: [0, 0.1, 0], hoverEl: card, delay: i * 0.18 }, async (scene) => {
      const m = await make();
      scene.add(m.object);
      return (t, s) => m.update && m.update(t, s);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Principles: an object in each bento card
  // ---------------------------------------------------------------------------------------------
  const icons = { craft: M.createCraft, print: M.createPrintTrue, languages: M.createLanguages, ownership: M.createOwnership, clarity: M.createClarity, free: M.createFree };
  document.querySelectorAll('.bento article[data-model]').forEach((card, i) => {
    const make = icons[card.dataset.model];
    if (!make) return;
    const big = card.classList.contains('b-big');
    view(card.querySelector('.p-model'), { fov: 28, cam: big ? [0, 0.9, 5.4] : [0, 0.7, 6.2], look: [0, -0.1, 0], hoverEl: card, intro: 1.1, delay: (i % 3) * 0.12 }, async (scene) => {
      const m = await make();
      scene.add(m.object);
      return (t, s) => m.update && m.update(t, s);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Footer: the layered Folio "F"
  // ---------------------------------------------------------------------------------------------
  const logoEl = document.querySelector('.foot-logo');
  view(logoEl, { fov: 28, cam: [0, 0.3, 7.4], hoverEl: logoEl && logoEl.closest('.foot-cta'), intro: 1.4 }, async (scene) => {
    const m = M.createLogo3D();
    scene.add(m.object);
    return (t, s) => m.update(t, s);
  });

  // ---------------------------------------------------------------------------------------------
  // Presentation: a laptop that opens as the page scrolls; the editor's panels lift off the screen
  // ---------------------------------------------------------------------------------------------
  const track = document.querySelector('.pres-track'), presEl = document.querySelector('.presentation');
  view(document.querySelector('.pres-3d'), { fov: 28, cam: [0, 0, 10] }, async (scene, camera) => {
    const loader = new TextureLoader();
    const load = (src) => new Promise((res) => loader.load(src, (tx) => { tx.colorSpace = SRGBColorSpace; tx.anisotropy = 8; res(tx); }, undefined, () => res(null)));
    const [dark, light] = await Promise.all([load('assets/editor-dark.webp'), load('assets/editor.webp')]);
    const g = new Group();
    const metal = mat.aluminium();
    const base = new Mesh(new RoundedBoxGeometry(3.4, 0.11, 2.3, 4, 0.045), metal);
    base.position.y = -0.055;
    const deck = M.keycaps({ width: 2.82, depth: 0.96, cols: 14, rows: 5, color: '#121214', height: 0.022 });
    deck.position.set(0, 0.002, -0.4);
    const hingeBar = new Mesh(new CylinderGeometry(0.05, 0.05, 2.7, 20), new MeshStandardMaterial({ color: '#b9b9bf', metalness: 0.8, roughness: 0.35 }));
    hingeBar.rotation.z = Math.PI / 2; hingeBar.position.set(0, 0.02, -1.12);
    const pad = new Mesh(new PlaneGeometry(1.15, 0.66), new MeshStandardMaterial({ color: '#c6c6ca', roughness: 0.3, metalness: 0.6 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.002, 0.64);
    const hinge = new Group();
    hinge.position.set(0, 0.02, -1.13);
    const lid = new Mesh(new RoundedBoxGeometry(3.4, 2.24, 0.06, 4, 0.025), metal);
    lid.position.set(0, 1.12, -0.03);
    const bezel = new Mesh(new PlaneGeometry(3.32, 2.16), new MeshBasicMaterial({ color: '#050505' }));
    bezel.position.set(0, 1.12, 0.0005);
    const SW = 3.12, SH = 1.95, SY = 1.14;
    const screenMat = new MeshBasicMaterial({ map: dark, toneMapped: false });
    const screen = new Mesh(new PlaneGeometry(SW, SH), screenMat);
    screen.position.set(0, SY, 0.001);
    hinge.add(lid, bezel, screen);
    // panels cut from the screenshot (u0, u1, top, bottom as fractions of the image) that lift off
    const cuts = [[0, 0.118, 0.235, 1, 0.34], [0.298, 0.626, 0.272, 1, 0.55], [0.8, 1, 0.215, 0.6, 0.42]];
    const crop = (src, [u0, u1, a, b]) => { if (!src) return null; const c = src.clone(); c.repeat.set(u1 - u0, b - a); c.offset.set(u0, 1 - b); c.needsUpdate = true; return c; };
    const panels = cuts.map((cut) => {
      const [u0, u1, a, b, lift] = cut;
      const m = new MeshBasicMaterial({ map: crop(dark, cut), toneMapped: false });
      const p = new Mesh(new PlaneGeometry((u1 - u0) * SW, (b - a) * SH), m);
      const shadow = new Mesh(new PlaneGeometry((u1 - u0) * SW, (b - a) * SH), new MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false }));
      const x = ((u0 + u1) / 2 - 0.5) * SW, y = SY + (0.5 - (a + b) / 2) * SH;
      p.position.set(x, y, 0.002); shadow.position.set(x, y - 0.03, 0.0015);
      hinge.add(shadow, p);
      return { p, shadow, m, cut, lift, x, y, light: crop(light, cut), dark: m.map };
    });
    g.add(base, deck, hingeBar, pad, hinge, contactShadow(5, 3.4, 0.22, -0.12));
    scene.add(g);
    document.addEventListener('folio:theme', (e) => {
      const isLight = e.detail === 'light';
      if (light && dark) { screenMat.map = isLight ? light : dark; screenMat.needsUpdate = true; }
      for (const pn of panels) { const map = isLight ? pn.light : pn.dark; if (map) { pn.m.map = map; pn.m.needsUpdate = true; } }
      frame();
    });
    let px = 0, py = 0;
    return (t, s, rect) => {
      let p = 1;
      if (track && !REDUCED) {
        const r = track.getBoundingClientRect();
        p = clamp01((-r.top / Math.max(1, r.height - innerHeight)) * 1.3);
      }
      px = damp(px, pointer.x, 4, s.dt); py = damp(py, pointer.y, 4, s.dt);
      const open = easeOut(clamp01(p / 0.6));
      // the three panels lift one after another; the step list under the laptop follows along
      const lifts = panels.map((_, i) => easeOut(clamp01((p - 0.58 - i * 0.12) / 0.16)));
      const lift = Math.max(...lifts);
      const step = p < 0.58 ? 0 : p < 0.7 ? 1 : p < 0.82 ? 2 : 3;
      if (presEl && presEl.dataset.step !== String(step)) presEl.dataset.step = String(step);
      hinge.rotation.x = MathUtils.degToRad(MathUtils.lerp(86, -14, open));
      // once the panels lift, the laptop turns a little so their depth shows
      g.rotation.set(MathUtils.lerp(0.55, 0.24, open) - py * 0.06, MathUtils.lerp(-0.7, 0, open) - lift * 0.3 + px * 0.12 * (1 - lift * 0.5), 0);
      g.position.set(0, MathUtils.lerp(-0.45, -0.85, open), 0);
      panels.forEach((pn, i) => {
        const l = lifts[i];
        pn.p.position.z = 0.002 + l * pn.lift;
        pn.p.scale.setScalar(1 + l * 0.06);
        pn.shadow.position.z = 0.0015 + l * pn.lift * 0.35;
        pn.shadow.material.opacity = l * 0.28;
      });
      const aspect = rect.width / Math.max(1, rect.height);
      const near = Math.max(6.4, 4.3 / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect));
      camera.position.set(0, 0, MathUtils.lerp(near + 3, near, open));
      camera.lookAt(0, 0.12, 0);
    };
  });

  // ---------------------------------------------------------------------------------------------
  // First visit: the cutscene plays in a full-screen view above the page (see intro.js)
  // ---------------------------------------------------------------------------------------------
  if (root.classList.contains('intro-on')) {
    const signal = { skip: false, progress: 0, timeScale: 1 };
    window.__folioIntro = signal;
    const bar = document.querySelector('.intro-bar');
    view(document.querySelector('.intro-3d'), { fov: 34, lights: { key: 2.6 } }, async (scene, camera, v) => {
      v.isIntro = true;
      const update = await buildIntro(scene, camera, signal);
      return (t, s) => { update(t, s); if (bar) bar.style.setProperty('--ip', String(signal.progress)); };
    });
    document.addEventListener('folio:intro-skip', () => { signal.skip = true; frame(); });
    document.addEventListener('folio:intro-done', () => {
      const i = views.findIndex((x) => x.isIntro);
      if (i >= 0) { disposeScene(views[i].scene); io.unobserve(views[i].el); views.splice(i, 1); }
      frame();
    });
  }

  resize();
  new ResizeObserver(() => { resize(); frame(); }).observe(canvas);
  addEventListener('scroll', frame, { passive: true });
  if (REDUCED) addEventListener('pointermove', frame, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) frame(); });
  root.classList.add('has-3d');
  frame();
}
