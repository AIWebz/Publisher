// Folio site 3D. One WebGL canvas fixed over the page renders every model into the rectangle of its
// host element (scissored views), so all the models share one context. Views render only while on
// screen; under prefers-reduced-motion they render still frames on demand.
// Bundled to site/assets/scene.js by `npm run build:site`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, PlaneGeometry, CylinderGeometry, MeshStandardMaterial, MeshBasicMaterial,
  TextureLoader, SRGBColorSpace, NeutralToneMapping, PCFSoftShadowMap, MathUtils, Box3, Vector3
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { studioLights, roomEnvironment, mat, contactShadow, damp, clamp01, easeOut } from './models/kit.js';
import * as M from './models/objects.js';
import Lenis from 'lenis';
import { buildIntro, disposeScene } from './intro.js';
import { buildPrintStage } from './printstage.js';
import { drawTemplate, designFonts } from './models/designs.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

// smooth, inertial wheel scrolling (touch keeps native scrolling; off under reduced motion)
if (!REDUCED) {
  const lenis = new Lenis({ lerp: 0.085, anchors: { offset: -72 }, autoRaf: true });
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
  // without 3D the hero shows one printed sample as a flat page
  const stage = document.querySelector('.print-stage');
  if (stage) designFonts().then(() => { const c = drawTemplate('poster', 640); c.className = 'print-fallback'; c.setAttribute('aria-hidden', 'true'); stage.appendChild(c); });
}

if (renderer) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.autoClear = false; // views may overlap, so each clears only its depth
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
      if (v.manual && !v.el.classList.contains('on')) continue;
      const r = v.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width < 2 || r.height < 2) continue;
      live = true;
      if (v.start == null) v.start = t;
      v.hover = REDUCED ? 0 : damp(v.hover, v.hoverTarget, 10, dt);
      const enter = REDUCED ? 1 : easeOut((t - v.start - v.delay) / v.intro);
      const scroll = MathUtils.clamp((r.top + r.height / 2 - H / 2) / (H / 2 + r.height / 2), -1, 1);
      v.update(t, { dt, hover: v.hover, enter, scroll }, r);
      v.camera.aspect = r.width / r.height;
      v.camera.updateProjectionMatrix();
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.clearDepth();
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
  function view(el, { fov = 30, cam = [0, 0.6, 6.5], look = [0, 0, 0], hoverEl = el, intro = 1.6, delay = 0, lights, manual = false } = {}, build) {
    if (!el) return null;
    const scene = new Scene();
    scene.environment = env;
    studioLights(scene, lights);
    const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
    camera.position.set(...cam);
    camera.lookAt(...look);
    const v = { el, scene, camera, visible: false, hover: 0, hoverTarget: 0, update: null, start: null, intro, delay, manual };
    views.push(v);
    io.observe(el);
    const on = () => { v.hoverTarget = 1; frame(); }, off = () => { v.hoverTarget = 0; frame(); };
    if (hoverEl) {
      hoverEl.addEventListener('pointerenter', on); hoverEl.addEventListener('pointerleave', off);
      hoverEl.addEventListener('focusin', on); hoverEl.addEventListener('focusout', off);
    }
    Promise.resolve(build(scene, camera, v)).then((update) => { v.update = update; frame(); });
    return v;
  }

  // ---------------------------------------------------------------------------------------------
  // Hero: the print studio (see printstage.js); the sample chips choose what it prints
  // ---------------------------------------------------------------------------------------------
  const stageEl = document.querySelector('.print-stage');
  const chips = [...document.querySelectorAll('.prints [role="radio"]')];
  view(stageEl, { fov: 30, hoverEl: null, intro: 2.4, delay: 0.3, lights: { key: 1.1 } }, (scene, camera) =>
    buildPrintStage(scene, camera, {
      stageEl, chips, reduced: REDUCED,
      onChange: (i) => { chips.forEach((c, k) => { c.setAttribute('aria-checked', String(k === i)); c.tabIndex = k === i ? 0 : -1; }); frame(); }
    }));
  // arrow keys move between the sample chips (a radio group)
  chips.forEach((c, i) => c.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = chips[(i + d + chips.length) % chips.length];
    n.focus(); n.click();
  }));

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
