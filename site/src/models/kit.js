// Shared palette, materials and helpers for the site's 3D models (light theme: black page, white liquid-glass type, monochrome accents).
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
  HemisphereLight, DirectionalLight, PointLight, PMREMGenerator, RepeatWrapping, InstancedMesh, Object3D
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// monochrome accents: white, silver and graphite (the site is black with liquid-glass type)
export const WHITE = '#f4f4f5';
export const GRAPHITE = '#52525b';
export const SILVER = '#d4d4d8';
export const INK = '#0a0a0a';
export const PAPER = '#fbfbf7';
export const SANS = '"Space Grotesk", system-ui, sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
export const easeInOut = (v) => { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
/** Frame-rate independent smoothing of current toward target. */
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
/** Stagger helper: progress of item i (of n) inside an overall 0…1 progress. */
export const stagger = (p, i, n, spread = 0.5) => clamp01((p - (i / Math.max(1, n - 1)) * spread) / (1 - spread));

/** A silver sheen as a canvas gradient from (x0, y0) to (x1, y1): graphite tones for paper, light tones on dark. */
export function blend(c, x0, y0, x1, y1, onDark = false) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, onDark ? '#ffffff' : '#18181b'); g.addColorStop(0.5, onDark ? '#a1a1aa' : '#71717a'); g.addColorStop(1, onDark ? '#e4e4e7' : '#27272a');
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
export function studioLights(scene, { key = 2.4, rim = '#ffffff' } = {}) {
  scene.add(new HemisphereLight('#ffffff', '#3a3a44', 0.8));
  // a second rim from the left so dark objects keep their silhouette on the black page
  const r2 = new PointLight('#d4d4d8', 32, 30, 1.6);
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

/** Clear, slightly frosted physical glass (transmission, clear coat, a touch of dispersion). */
export function glassMat(opts = {}) {
  return new MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.6, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.04, dispersion: 0.2, attenuationColor: '#eef1f6', attenuationDistance: 2.5, envMapIntensity: 1.5, ...opts });
}

let grainCache = null;
/** A fine, tileable grain texture for bump maps (paper, cloth, anodised metal). */
export function grain() {
  if (!grainCache) {
    grainCache = canvasTexture(256, 256, (c, w, h) => {
      const d = c.createImageData(w, h);
      for (let i = 0; i < d.data.length; i += 4) { const v = 110 + Math.random() * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      c.putImageData(d, 0, 0);
    });
    grainCache.colorSpace = '';
    grainCache.wrapS = grainCache.wrapT = RepeatWrapping;
    grainCache.repeat.set(3, 3);
  }
  return grainCache;
}

/** Curl a flat sheet: offsets z by amount × (x / halfWidth)² (the geometry needs width segments). */
export function bend(geometry, amount) {
  geometry.computeBoundingBox();
  const half = (geometry.boundingBox.max.x - geometry.boundingBox.min.x) / 2 || 1;
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / half; p.setZ(i, p.getZ(i) + amount * x * x); }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** A keyboard of instanced key caps laid on the XZ plane (rows from the back). */
export function keycaps({ width, depth, cols = 14, rows = 5, color = '#1d1d1f', height = 0.02 } = {}) {
  const kw = width / cols, kd = depth / rows;
  const geo = new RoundedBoxGeometry(kw * 0.84, height, kd * 0.8, 2, Math.min(kw, kd) * 0.12);
  const keys = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (r === rows - 1 && k > 3 && k < 10) { if (k === 4) keys.push({ x: (4 + 3) * kw - width / 2, z: r * kd - depth / 2 + kd / 2, sx: 6 }); continue; }
    keys.push({ x: k * kw - width / 2 + kw / 2, z: r * kd - depth / 2 + kd / 2, sx: 1 });
  }
  const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }), keys.length);
  const o = new Object3D();
  keys.forEach((key, i) => { o.position.set(key.x, height / 2, key.z); o.scale.set(key.sx === 6 ? 6.6 : 1, 1, 1); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  return mesh;
}
