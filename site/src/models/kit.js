// Shared palette, materials and helpers for the site's 3D models (light theme: white page, black type, a blue–cyan–pink accent blend).
//
// Model contract — every model module exports factory functions returning
//   { object: Object3D, update?(t, s) }
// where t is seconds since the page loaded and s = { dt, hover, enter, scroll }:
//   hover  0…1 eased pointer-over amount of the model's host element
//   enter  0…1 eased intro progress (starts the first time the model scrolls into view)
//   scroll -1…1 the host element's position relative to the viewport centre (0 = centred)
// Units: a model fits a ~2×2×2 box centred on the origin, Y up, its front facing +Z.
// Under prefers-reduced-motion the host calls update with enter = 1, hover = 0 and a fixed t.
import {
  CanvasTexture, SRGBColorSpace, MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, Mesh, PlaneGeometry,
  HemisphereLight, DirectionalLight, PointLight, PMREMGenerator
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// the accent is a blend of blue, cyan and pink (used sparingly on a black-and-white base)
export const BLUE = '#3b82f6';
export const CYAN = '#22d3ee';
export const PINK = '#ec4899';
export const SILVER = '#d4d4d8';
export const INK = '#0a0a0a';
export const PAPER = '#fbfbf7';
export const SANS = '"Inter", system-ui, sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
export const easeInOut = (v) => { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
/** Frame-rate independent smoothing of current toward target. */
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
/** Stagger helper: progress of item i (of n) inside an overall 0…1 progress. */
export const stagger = (p, i, n, spread = 0.5) => clamp01((p - (i / Math.max(1, n - 1)) * spread) / (1 - spread));

/** The accent blend as a canvas gradient from (x0, y0) to (x1, y1). */
export function blend(c, x0, y0, x1, y1, deep = false) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, deep ? '#2563eb' : BLUE); g.addColorStop(0.5, deep ? '#0891b2' : CYAN); g.addColorStop(1, deep ? '#db2777' : PINK);
  return g;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function loadImage(src) {
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}

/** Grey text lines for mock layouts drawn on canvas textures. */
export function lines(g, x, y, w, n, gap, color, last = 0.6) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * gap, i === n - 1 ? w * last : w, gap * 0.38);
}

export const mat = {
  ink: () => new MeshStandardMaterial({ color: '#2b2b31', roughness: 0.35, metalness: 0.4 }),
  paper: () => new MeshStandardMaterial({ color: PAPER, roughness: 0.85 }),
  aluminium: () => new MeshStandardMaterial({ color: '#d4d4d8', metalness: 0.9, roughness: 0.3 }),
  graphite: () => new MeshStandardMaterial({ color: '#3a3a3f', metalness: 0.75, roughness: 0.35 }),
  plastic: (color) => new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0 }),
  glass: () => new MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.45, transparent: true })
};

/** Soft, fake contact shadow: a transparent plane with a radial gradient, laid flat at y. */
export function contactShadow(w = 2, d = 1.2, opacity = 0.22, y = -1) {
  const tex = canvasTexture(256, 256, (g, cw, ch) => {
    const r = g.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, cw, ch);
  });
  const m = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = -1;
  return m;
}

/** The standard studio lighting used by every view (the page is white, so keep it bright and soft). */
export function studioLights(scene, { key = 2.4, rim = CYAN } = {}) {
  scene.add(new HemisphereLight('#ffffff', '#3a3a44', 0.8));
  // a pink rim from the left so dark objects keep their silhouette on the black page
  const r2 = new PointLight(PINK, 36, 30, 1.6);
  r2.position.set(-5, 1, -4);
  scene.add(r2);
  const k = new DirectionalLight('#ffffff', key);
  k.position.set(-4, 7, 6);
  scene.add(k);
  const r = new PointLight(rim, 40, 30, 1.6);
  r.position.set(5, 2, -4);
  scene.add(r);
}

/** A neutral room environment map for reflections (create once per renderer). */
export function roomEnvironment(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}
