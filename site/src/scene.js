// Folio site 3D. One WebGL canvas fixed over the page renders every model into the rectangle of its
// host element (scissored views), so a dozen models cost one context. Views render only while on
// screen; under prefers-reduced-motion they render still frames on demand.
// Bundled to site/assets/scene.js by `npm run build:site`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial,
  TextureLoader, SRGBColorSpace, NeutralToneMapping, MathUtils
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { studioLights, roomEnvironment, canvasTexture, mat, contactShadow, damp, clamp01, easeOut, easeInOut, stagger } from './models/kit.js';
import * as M from './models/objects.js';
import Lenis from 'lenis';
import { buildIntro, disposeScene } from './intro.js';

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
      renderer.render(v.scene, v.camera);
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
  // Hero: the book with the print pieces, swatch fan and pencil around it
  // ---------------------------------------------------------------------------------------------
  const heroEl = document.querySelector('.hero-3d');
  view(heroEl, { fov: 30, cam: [0, 0, 11], hoverEl: heroEl, intro: 2.2, delay: 0.25 }, async (scene, camera) => {
    const world = new Group();
    scene.add(world);
    const items = await Promise.all([
      [M.createBook, [0, 0, 0], [0, 0, 0], 1, 0],
      [M.createSwatchFan, [-1.55, 1.15, -1.6], [0.1, 0.4, 0.25], 0.62, 0.7],
      [M.createFlyer, [1.45, 1.25, -1.4], [0.15, -0.5, 0.12], 0.85, 0.5],
      [M.createCard, [-1.35, -1.45, 1.1], [-0.25, 0.55, -0.18], 0.85, 0.9],
      [M.createBrochure, [1.3, -1.6, 0.8], [-0.2, -0.35, 0.05], 0.9, 0.6],
      [M.createPencil, [-1.55, 0.05, 1.2], [0.4, 0.3, 0.95], 0.7, 1.2]
    ].map(async ([make, p, r, scale, depth], i) => {
      const m = await make();
      const holder = new Group();
      holder.add(m.object);
      holder.position.set(...p);
      holder.rotation.set(...r);
      holder.scale.setScalar(scale);
      world.add(holder);
      return { m, holder, p, r, scale, depth, i };
    }));
    const n = items.length;
    let px = 0, py = 0;
    const fit = (rect) => {
      const aspect = rect.width / Math.max(1, rect.height);
      camera.position.z = Math.max(10.5, 4.6 / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect));
    };
    return (t, s, rect) => {
      fit(rect);
      px = damp(px, pointer.x, 4, s.dt); py = damp(py, pointer.y, 4, s.dt);
      const out = Math.max(0, -s.scroll); // 0 at rest, grows as the hero scrolls away
      for (const it of items) {
        const e = it.i === 0 ? s.enter : stagger(s.enter, it.i, n, 0.55);
        const k = easeOut(e);
        const [x, y, z] = it.p;
        // fly in from further out, drift apart while scrolling away, parallax by depth
        const spread = 1 + (1 - k) * 1.6 + out * 1.4;
        it.holder.position.set(x * spread + px * it.depth * 0.6, y * spread - py * it.depth * 0.4 + (it.i ? Math.sin(t * 0.8 + it.i * 2) * 0.1 : 0), z - (1 - k) * 2);
        it.holder.rotation.set(it.r[0] - py * 0.2 * it.depth, it.r[1] + px * 0.5 * (it.depth || 0.6) + (it.i ? Math.sin(t * 0.5 + it.i) * 0.12 : 0) + out * it.i * 0.3, it.r[2]);
        it.holder.scale.setScalar(it.scale * (it.i ? k : 1));
        it.holder.visible = it.i === 0 || k > 0.001;
        if (it.m.update) it.m.update(t, { dt: s.dt, hover: it.i === 0 ? s.hover : 0, enter: e, scroll: s.scroll });
      }
      world.rotation.y = px * 0.18;
      world.position.y = out * 1.2;
    };
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
  // Principles: an icon object in each card
  // ---------------------------------------------------------------------------------------------
  const icons = [M.createClarity, M.createOwnership, M.createPrintTrue, M.createLanguages, M.createCraft, M.createFree];
  document.querySelectorAll('.grid article').forEach((card, i) => {
    view(card.querySelector('.p-model'), { fov: 28, cam: [0, 0.7, 6.2], look: [0, -0.1, 0], hoverEl: card, intro: 1.1, delay: (i % 3) * 0.12 }, async (scene) => {
      const m = await icons[i]();
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
  const track = document.querySelector('.pres-track');
  view(document.querySelector('.pres-3d'), { fov: 28, cam: [0, 0, 10] }, async (scene, camera) => {
    const loader = new TextureLoader();
    const load = (src) => new Promise((res) => loader.load(src, (tx) => { tx.colorSpace = SRGBColorSpace; tx.anisotropy = 8; res(tx); }, undefined, () => res(null)));
    const [dark, light] = await Promise.all([load('assets/editor-dark.webp'), load('assets/editor.webp')]);
    const g = new Group();
    const metal = mat.aluminium();
    const deckTex = canvasTexture(1024, 360, (c, w, h) => {
      c.fillStyle = '#cfcfd3'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d1d1f';
      for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) {
        if (r === 4 && k > 4 && k < 10) continue;
        const wide = r === 4 && k === 4;
        c.beginPath(); c.roundRect(k * 73 + 5, r * 72 + 5, (wide ? 73 * 6 : 73) - 10, 62, 8); c.fill();
      }
    });
    const base = new Mesh(new RoundedBoxGeometry(3.4, 0.11, 2.3, 4, 0.045), metal);
    base.position.y = -0.055;
    const deck = new Mesh(new PlaneGeometry(2.86, 1.0), new MeshStandardMaterial({ map: deckTex, roughness: 0.6, metalness: 0.3 }));
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.002, -0.4);
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
    g.add(base, deck, pad, hinge, contactShadow(5, 3.4, 0.22, -0.12));
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
        p = clamp01((-r.top / Math.max(1, r.height - innerHeight)) * 1.25 + 0.1);
      }
      px = damp(px, pointer.x, 4, s.dt); py = damp(py, pointer.y, 4, s.dt);
      const open = easeOut(clamp01(p / 0.65));
      const lift = easeOut(clamp01((p - 0.62) / 0.3));
      hinge.rotation.x = MathUtils.degToRad(MathUtils.lerp(86, -14, open));
      g.rotation.set(MathUtils.lerp(0.55, 0.22, open) - py * 0.06, MathUtils.lerp(-0.7, 0, open) + px * 0.12 * (1 - lift * 0.5), 0);
      g.position.set(0, MathUtils.lerp(-0.5, -1.05, open), 0);
      for (const pn of panels) {
        pn.p.position.z = 0.002 + lift * pn.lift;
        pn.p.scale.setScalar(1 + lift * 0.06);
        pn.shadow.position.z = 0.0015 + lift * pn.lift * 0.35;
        pn.shadow.material.opacity = lift * 0.28;
      }
      const aspect = rect.width / Math.max(1, rect.height);
      const near = Math.max(8.4, 4.6 / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect));
      camera.position.set(0, 0, MathUtils.lerp(near + 3, near, open));
      camera.lookAt(0, 0.4, 0);
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
