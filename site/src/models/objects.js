// The site's 3D models (see kit.js for the contract): hero desk objects, install devices, principle
// icons and the layered Folio "F". Everything is built from primitives and canvas textures.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, SphereGeometry, IcosahedronGeometry,
  PlaneGeometry, ExtrudeGeometry, Shape, InstancedMesh, Object3D, MeshStandardMaterial, MeshBasicMaterial, DoubleSide
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BLUE, CYAN, PINK, blend, PAPER, SANS, MONO, canvasTexture, loadImage, lines, mat, contactShadow, damp, clamp01,
  easeOut, easeInOut, stagger
} from './kit.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
/** Box with a texture on its front (+z) face only. */
function faced(w, h, d, front, side) {
  return new Mesh(new BoxGeometry(w, h, d), [side, side, side, side, front, side]);
}
const tex = (map, opts = {}) => new MeshStandardMaterial({ map, roughness: 0.75, ...opts });

// ------------------------------------------------------------------------------------------------
// Hero: book, print pieces, swatch fan, pencil
// ------------------------------------------------------------------------------------------------

export async function createBook() {
  const logo = await loadImage('assets/logo-white.png');
  const W = 2, H = 2.8, D = 0.42, T = 0.05;
  const g = new Group();
  const board = new MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.2 });
  const cover = tex(canvasTexture(1024, 1434, (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#303037'); bg.addColorStop(1, '#111115');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 2;
    for (let x = 64; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 64; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    if (logo) c.drawImage(logo, 112, 120, 190, 190 * logo.height / logo.width);
    c.fillStyle = '#fff'; c.font = `600 190px ${SANS}`; c.fillText('Folio', 100, 780);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `400 40px ${MONO}`; c.fillText('Desktop publishing', 112, 860);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(112, 1180, 800, 3);
    c.fillStyle = blend(c, 112, 0, 680, 0); c.font = `500 44px ${MONO}`; c.fillText('THE NEW ERA OF DESIGN', 112, 1262);
  }), { roughness: 0.42, metalness: 0.15 });
  const endpaper = tex(canvasTexture(512, 716, (c, w, h) => {
    c.fillStyle = '#eef4ff'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(236,72,153,.22)';
    for (let y = 20; y < h; y += 40) for (let x = (y / 40) % 2 ? 20 : 40; x < w; x += 40) { c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
  }));
  const firstPage = tex(canvasTexture(700, 980, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    c.fillStyle = '#111'; c.font = `500 22px ${MONO}`; c.fillText('FOLIO MAGAZINE · ISSUE 01', 50, 70);
    c.fillRect(50, 88, w - 100, 2);
    c.font = `700 74px ${SANS}`; c.fillText('The New', 50, 190); c.fillStyle = blend(c, 50, 0, 560, 0, true); c.fillText('Era Of Design', 50, 270);
    c.fillStyle = blend(c, 50, 310, w - 50, 580); c.fillRect(50, 310, w - 100, 270);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(w - 170, 445, 80, 0, TAU); c.fill();
    lines(c, 50, 620, (w - 130) / 2, 10, 30, 'rgba(0,0,0,.32)');
    lines(c, 50 + (w - 130) / 2 + 30, 620, (w - 130) / 2, 10, 30, 'rgba(0,0,0,.32)', 0.4);
  }));
  const stripes = (vertical) => tex(canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#f3f3ef'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.1)';
    for (let i = 0; i < 256; i += 4) vertical ? c.fillRect(i, 0, 1, h) : c.fillRect(0, i, w, 1);
  }), { roughness: 0.9 });
  const spineTex = tex(canvasTexture(256, 1434, (c, w, h) => {
    c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2 + 26, 120); c.rotate(Math.PI / 2);
    c.fillStyle = blend(c, 0, 0, 200, 0); c.font = `600 78px ${SANS}`; c.fillText('Folio', 0, 0); c.restore();
  }), { roughness: 0.45, metalness: 0.2 });
  const edgeSide = stripes(true), edgeTop = stripes(false), paper = mat.paper();

  const back = new Mesh(new BoxGeometry(W, H, T), board);
  back.position.z = -D / 2 - T / 2;
  const spine = new Mesh(new BoxGeometry(T, H, D + 2 * T), [board, spineTex, board, board, board, board]);
  spine.position.x = -W / 2 - T / 2;
  const pages = new Mesh(new BoxGeometry(W - 0.07, H - 0.08, D), [edgeSide, paper, edgeTop, edgeTop, firstPage, paper]);
  pages.position.x = -0.035;
  // the front cover swings open around the spine
  const hinge = new Group();
  hinge.position.set(-W / 2, 0, D / 2 + T / 2);
  const front = new Mesh(new BoxGeometry(W, H, T), [board, board, board, board, cover, endpaper]);
  front.position.x = W / 2;
  hinge.add(front);
  const book = new Group();
  book.add(back, spine, pages, hinge);
  g.add(book);
  let open = 0;
  return {
    object: g,
    update(t, s) {
      const e = easeOut(s.enter);
      open = damp(open, s.hover, 6, s.dt);
      hinge.rotation.y = -open * 1.35;
      book.rotation.set(0.12 - (1 - e) * 0.3, lerp(-1.55, -0.45, e) + open * 0.35, 0.04 * e);
      book.scale.setScalar(lerp(0.7, 1, e));
      book.position.y = Math.sin(t * 0.8) * 0.08;
    }
  };
}

function paperPiece(w, h, map, back = '#f4f4f0') {
  return faced(w, h, 0.012, tex(map), new MeshStandardMaterial({ color: back, roughness: 0.8 }));
}

export function createFlyer() {
  const m = paperPiece(1.25, 1.75, canvasTexture(500, 700, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    c.fillStyle = blend(c, 30, 30, w - 30, 330); c.fillRect(30, 30, w - 60, 300);
    c.fillStyle = '#0a0a0a'; c.beginPath(); c.arc(w - 120, 190, 70, 0, TAU); c.fill();
    c.fillStyle = '#0a0a0a'; c.font = `700 64px ${SANS}`; c.fillText('Summer', 30, 410); c.fillText('Fair', 30, 476);
    lines(c, 30, 520, w - 60, 4, 30, 'rgba(0,0,0,.35)');
    c.fillStyle = '#0a0a0a'; c.fillRect(30, h - 70, 160, 36);
  }));
  return { object: m };
}

export function createCard() {
  const m = paperPiece(1.05, 0.62, canvasTexture(525, 310, (c, w, h) => {
    c.fillStyle = '#0d0d0d'; c.fillRect(0, 0, w, h);
    c.fillStyle = blend(c, 0, 0, w, 0); c.fillRect(0, h - 10, w, 10);
    c.fillStyle = '#fff'; c.font = `600 44px ${SANS}`; c.fillText('Ada Park', 34, 90);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `400 22px ${MONO}`; c.fillText('Art director', 36, 128);
    lines(c, 36, 200, 230, 3, 24, 'rgba(255,255,255,.35)', 0.8);
  }), '#0d0d0d');
  return { object: m };
}

export function createBrochure() {
  const g = new Group();
  const panel = (i) => canvasTexture(240, 440, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    if (i === 1) { c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, 190); c.fillStyle = CYAN; c.fillRect(20, 150, 90, 12); }
    else { c.fillStyle = 'rgba(0,0,0,.8)'; c.fillRect(20, 30, 140, 22); }
    lines(c, 20, i === 1 ? 220 : 80, w - 40, i === 1 ? 6 : 10, 26, 'rgba(0,0,0,.3)');
  });
  const P = 0.62, H = 1.14;
  const mid = paperPiece(P, H, panel(1));
  // side panels hinge on the middle panel's edges and unfold during the intro
  const left = new Group(), right = new Group();
  left.position.x = -P / 2; right.position.x = P / 2;
  const l = paperPiece(P, H, panel(0)); l.position.x = -P / 2; left.add(l);
  const r = paperPiece(P, H, panel(2)); r.position.x = P / 2; right.add(r);
  g.add(mid, left, right);
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 6, s.dt);
      const fold = lerp(2.9, 0.5, easeInOut(s.enter)) - h * 0.35;
      left.rotation.y = fold; right.rotation.y = -fold;
    }
  };
}

export function createSwatchFan() {
  const colors = ['#0a0a0a', '#1e3a8a', '#2563eb', BLUE, '#06b6d4', CYAN, '#a5f3fc', '#f9a8d4', PINK, '#be185d'];
  const g = new Group();
  const pin = new Mesh(new CylinderGeometry(0.06, 0.06, 0.2, 20), mat.aluminium());
  pin.rotation.x = Math.PI / 2;
  g.add(pin);
  const strips = colors.map((col, i) => {
    const map = canvasTexture(64, 380, (c, w, h) => {
      c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, h);
      c.fillStyle = col; c.fillRect(0, 0, w, h * 0.72);
      c.fillStyle = '#333'; c.font = `500 11px ${MONO}`; c.fillText(col.toUpperCase(), 6, h * 0.8);
    });
    const piv = new Group();
    const m = faced(0.3, 1.9, 0.012, tex(map, { roughness: 0.6 }), mat.plastic('#fafafa'));
    m.position.y = 0.88;
    piv.add(m);
    piv.position.z = (i - colors.length / 2) * 0.014;
    g.add(piv);
    return piv;
  });
  g.position.y = -0.6;
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 6, s.dt);
      const spread = lerp(0, 1.5, easeOut(s.enter)) + h * 0.45;
      strips.forEach((p, i) => { p.rotation.z = (i / (strips.length - 1) - 0.5) * spread; });
    }
  };
}

export function createPencil() {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.075, 0.075, 1.5, 6), mat.plastic(PINK));
  const wood = new Mesh(new ConeGeometry(0.075, 0.24, 6), mat.plastic('#e9c99c'));
  wood.position.y = 0.87;
  const lead = new Mesh(new ConeGeometry(0.026, 0.085, 12), mat.plastic('#222'));
  lead.position.y = 0.95;
  const ferrule = new Mesh(new CylinderGeometry(0.079, 0.079, 0.16, 16), mat.aluminium());
  ferrule.position.y = -0.83;
  const eraser = new Mesh(new CylinderGeometry(0.075, 0.075, 0.14, 16), mat.plastic('#f2b1a6'));
  eraser.position.y = -0.98;
  g.add(body, wood, lead, ferrule, eraser);
  return { object: g };
}

// ------------------------------------------------------------------------------------------------
// Install: monitor and laptops
// ------------------------------------------------------------------------------------------------

function screenTexture(src) {
  return loadImage(src).then((img) => canvasTexture(1024, 640, (c, w, h) => {
    if (img) c.drawImage(img, 0, 0, w, h);
    else { c.fillStyle = '#222'; c.fillRect(0, 0, w, h); }
  }));
}

export async function createMonitor() {
  const g = new Group();
  const body = mat.plastic('#e7e7ea');
  const wall = canvasTexture(1024, 620, (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, BLUE); bg.addColorStop(0.5, CYAN); bg.addColorStop(1, PINK);
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.96)'; c.fillRect(170, 90, 684, 430);
    c.fillStyle = '#f2f2f2'; c.fillRect(170, 90, 684, 40);
    c.fillStyle = '#ff5f57'; [0, 1, 2].forEach((i) => { c.beginPath(); c.arc(194 + i * 22, 110, 7, 0, TAU); c.fill(); });
    c.fillStyle = '#e8e8e8'; c.fillRect(186, 146, 90, 360);
    c.fillStyle = '#fff'; c.fillRect(330, 150, 300, 360); c.strokeStyle = '#ddd'; c.strokeRect(330, 150, 300, 360);
    c.fillStyle = blend(c, 350, 170, 610, 280); c.fillRect(350, 170, 260, 110);
    c.fillStyle = '#111'; c.font = `700 30px ${SANS}`; c.fillText('Newsletter', 350, 320);
    lines(c, 350, 340, 260, 6, 22, 'rgba(0,0,0,.3)');
    c.fillStyle = '#f4f4f4'; c.fillRect(670, 146, 168, 360);
  });
  const panel = new Mesh(new RoundedBoxGeometry(2.3, 1.44, 0.07, 3, 0.03), body);
  panel.position.y = 0.42;
  const bezel = new Mesh(new PlaneGeometry(2.22, 1.36), new MeshBasicMaterial({ color: '#0b0b0b' }));
  bezel.position.set(0, 0.42, 0.036);
  const screenMat = new MeshBasicMaterial({ map: wall, toneMapped: false });
  const screen = new Mesh(new PlaneGeometry(2.14, 1.3), screenMat);
  screen.position.set(0, 0.43, 0.037);
  const neck = new Mesh(new BoxGeometry(0.16, 0.6, 0.06), body);
  neck.position.set(0, -0.5, -0.08);
  const foot = new Mesh(new RoundedBoxGeometry(0.8, 0.04, 0.5, 2, 0.02), body);
  foot.position.set(0, -0.8, 0);
  const keys = canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#f2f2f4'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8d8dc';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) { c.beginPath(); c.roundRect(k * 32 + 2, r * 32 + 2, 28, 28, 4); c.fill(); }
  });
  const kb = new Mesh(new RoundedBoxGeometry(1.5, 0.04, 0.42, 2, 0.015), [body, body, tex(keys, { roughness: 0.6 }), body, body, body]);
  kb.position.set(0.05, -0.8, 0.62);
  const stand = new Group();
  stand.add(panel, bezel, screen, neck, foot);
  g.add(stand, kb, contactShadow(2.6, 1.6, 0.18, -0.83));
  let h = 0;
  return {
    object: g,
    update(t, s) {
      const e = easeOut(s.enter);
      h = damp(h, s.hover, 7, s.dt);
      g.position.y = lerp(-0.6, 0, e);
      g.rotation.y = lerp(0.8, -0.32, e) + h * 0.32 + Math.sin(t * 0.4) * 0.04;
      screenMat.color.setScalar(0.82 + h * 0.18);
      screen.position.z = 0.037 + h * 0.02;
    }
  };
}

function laptop({ shell, screenSrc }) {
  const g = new Group();
  const deckTex = canvasTexture(512, 180, (c, w, h) => {
    c.fillStyle = shell === 'silver' ? '#cfcfd3' : '#2c2c30'; c.fillRect(0, 0, w, h);
    c.fillStyle = shell === 'silver' ? '#1d1d1f' : '#0d0d0e';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) {
      if (r === 4 && k > 4 && k < 10) continue;
      const wide = r === 4 && k === 4;
      c.beginPath(); c.roundRect(k * 36.5 + 3, r * 36 + 3, (wide ? 36.5 * 6 : 36.5) - 6, 30, 4); c.fill();
    }
  });
  const metal = shell === 'silver' ? mat.aluminium() : mat.graphite();
  const base = new Mesh(new RoundedBoxGeometry(2.2, 0.07, 1.5, 3, 0.03), metal);
  base.position.y = -0.035;
  const deck = new Mesh(new PlaneGeometry(1.86, 0.62), tex(deckTex, { roughness: 0.6, metalness: 0.2 }));
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.001, -0.24);
  const pad = new Mesh(new PlaneGeometry(0.72, 0.42), new MeshStandardMaterial({ color: shell === 'silver' ? '#c4c4c8' : '#3a3a3f', roughness: 0.35, metalness: 0.6 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.001, 0.42);
  const hinge = new Group();
  hinge.position.set(0, 0.01, -0.74);
  const lid = new Mesh(new RoundedBoxGeometry(2.2, 1.45, 0.045, 3, 0.02), metal);
  lid.position.set(0, 0.725, -0.022);
  const bezel = new Mesh(new PlaneGeometry(2.14, 1.39), new MeshBasicMaterial({ color: '#060606' }));
  bezel.position.set(0, 0.725, 0.001);
  const screenMat = new MeshBasicMaterial({ color: '#111', toneMapped: false });
  const screen = new Mesh(new PlaneGeometry(2.02, 1.26), screenMat);
  screen.position.set(0, 0.74, 0.002);
  screenTexture(screenSrc).then((map) => { screenMat.map = map; screenMat.color.set('#ffffff'); screenMat.needsUpdate = true; });
  hinge.add(lid, bezel, screen);
  g.add(base, deck, pad, hinge, contactShadow(2.8, 2, 0.2, -0.08));
  return { g, hinge, screenMat };
}

function makeLaptop(shell, screenSrc, extra) {
  const { g, hinge, screenMat } = laptop({ shell, screenSrc });
  const root = new Group();
  root.add(g);
  g.position.y = -0.35;
  if (extra) root.add(extra.object);
  let h = 0;
  return {
    object: root,
    update(t, s) {
      const e = easeOut(s.enter);
      h = damp(h, s.hover, 7, s.dt);
      const angle = lerp(0, 100, easeInOut(stagger(s.enter, 1, 2, 0.4))) + h * 14;
      hinge.rotation.x = Math.PI / 2 - (angle * Math.PI) / 180;
      root.position.y = lerp(-0.6, 0, e);
      root.rotation.set(0.12, lerp(-0.9, -0.38, e) + h * 0.38 + Math.sin(t * 0.4) * 0.04, 0);
      screenMat.color.setScalar(screenMat.map ? 0.78 + h * 0.22 : 0.07);
      if (extra) extra.update(t, { ...s, hover: h });
    }
  };
}

export function createLaptopSilver() { return makeLaptop('silver', 'assets/editor.webp'); }

function chip() {
  const g = new Group();
  const pkg = new Mesh(new RoundedBoxGeometry(0.62, 0.07, 0.62, 2, 0.02), mat.ink());
  const die = new Mesh(new RoundedBoxGeometry(0.3, 0.03, 0.3, 2, 0.01), new MeshStandardMaterial({ color: CYAN, roughness: 0.25, metalness: 0.4, emissive: CYAN, emissiveIntensity: 0.2 }));
  die.position.y = 0.045;
  const pins = new InstancedMesh(new BoxGeometry(0.04, 0.03, 0.09), mat.aluminium(), 32);
  const o = new Object3D();
  let n = 0;
  for (let side = 0; side < 4; side++) for (let i = 0; i < 8; i++) {
    const a = -0.245 + i * 0.07;
    o.position.set(side < 2 ? a : (side === 2 ? -0.35 : 0.35), -0.01, side < 2 ? (side === 0 ? -0.35 : 0.35) : a);
    o.rotation.set(0, side < 2 ? 0 : Math.PI / 2, 0);
    o.updateMatrix(); pins.setMatrixAt(n++, o.matrix);
  }
  g.add(pkg, die, pins);
  g.position.set(0.95, 0.95, 0.2);
  return {
    object: g,
    update(t, s) {
      g.position.y = 0.95 + Math.sin(t * 1.4) * 0.06 + s.hover * 0.3;
      g.rotation.set(0.5, t * 0.5 + s.hover * 2.4, 0.15);
      g.scale.setScalar(easeOut(stagger(s.enter, 1, 2, 0.5)));
    }
  };
}

export function createLaptopGraphite() { return makeLaptop('graphite', 'assets/editor-dark.webp', chip()); }

// ------------------------------------------------------------------------------------------------
// Principles: six icon objects
// ------------------------------------------------------------------------------------------------

/** Shared pop-in + float + hover lift for the principle icons. */
function icon(build, onHover) {
  const g = new Group(), inner = new Group();
  build(inner);
  g.add(inner, contactShadow(1.7, 1.7, 0.2, -1.05));
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 7, s.dt);
      const e = clamp01(s.enter);
      // overshoot pop
      const pop = e < 1 ? 1 + Math.sin(e * Math.PI) * 0.12 * (1 - e) : 1;
      inner.scale.setScalar(easeOut(e) * pop);
      inner.position.y = Math.sin(t * 1.1) * 0.06 + h * 0.12;
      inner.rotation.y = Math.sin(t * 0.5) * 0.25 + h * 0.5;
      if (onHover) onHover(h, t);
    }
  };
}

export function createClarity() {
  let gem, core;
  return icon((g) => {
    gem = new Mesh(new IcosahedronGeometry(0.82, 0), new MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.12, metalness: 0.5, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false }));
    core = new Mesh(new IcosahedronGeometry(0.34, 0), new MeshStandardMaterial({ color: PINK, roughness: 0.3, flatShading: true }));
    g.add(gem, core);
  }, (h, t) => { gem.rotation.set(t * 0.3 + h * 1.2, t * 0.4, 0); core.rotation.set(-t * 0.6, -t * 0.8 - h * 2, 0); core.scale.setScalar(1 + h * 0.35); });
}

export function createOwnership() {
  let shackle;
  return icon((g) => {
    const body = new Mesh(new RoundedBoxGeometry(1.1, 0.9, 0.42, 3, 0.08), mat.ink());
    body.position.y = -0.3;
    const hole = new Mesh(new CylinderGeometry(0.09, 0.09, 0.05, 20), mat.plastic(CYAN));
    hole.rotation.x = Math.PI / 2; hole.position.set(0, -0.25, 0.22);
    const slot = new Mesh(new BoxGeometry(0.06, 0.2, 0.05), mat.plastic(CYAN));
    slot.position.set(0, -0.4, 0.22);
    shackle = new Group();
    const steel = mat.aluminium();
    const arc = new Mesh(new TorusGeometry(0.34, 0.075, 14, 36, Math.PI), steel);
    arc.position.y = 0.42;
    const legL = new Mesh(new CylinderGeometry(0.075, 0.075, 0.42, 14), steel); legL.position.set(-0.34, 0.21, 0);
    const legR = new Mesh(new CylinderGeometry(0.075, 0.075, 0.42, 14), steel); legR.position.set(0.34, 0.21, 0);
    shackle.add(arc, legL, legR);
    shackle.position.y = 0.05;
    // pivot around the left leg
    const piv = new Group(); piv.position.x = -0.34; shackle.position.x = 0.34; piv.add(shackle);
    g.add(body, hole, slot, piv);
    shackle.userData.piv = piv;
  }, (h) => { shackle.position.y = 0.05 + h * 0.28; shackle.userData.piv.rotation.y = h * 1.1; });
}

export function createPrintTrue() {
  let top;
  return icon((g) => {
    const sheet = (i) => canvasTexture(300, 400, (c, w, h) => {
      c.fillStyle = i ? '#e9e9ec' : '#fff'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#bdbdc2'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
      if (i === 0) {
        c.fillStyle = 'rgba(236,72,153,.2)'; c.fillRect(24, 24, w - 48, h - 48);
        c.fillStyle = PAPER; c.fillRect(36, 36, w - 72, h - 72);
        c.fillStyle = blend(c, 56, 56, w - 56, 166); c.fillRect(56, 56, w - 112, 110);
        c.fillStyle = '#111'; c.font = `700 30px ${SANS}`; c.fillText('Poster', 56, 210);
        lines(c, 56, 228, w - 112, 5, 22, 'rgba(0,0,0,.3)');
        c.strokeStyle = '#111'; c.lineWidth = 2;
        for (const [x, y] of [[36, 36], [w - 36, 36], [36, h - 36], [w - 36, h - 36]]) {
          c.beginPath(); c.moveTo(x, y < h / 2 ? 0 : h); c.lineTo(x, y < h / 2 ? 18 : h - 18); c.moveTo(x < w / 2 ? 0 : w, y); c.lineTo(x < w / 2 ? 18 : w - 18, y); c.stroke();
        }
      }
    });
    for (let i = 2; i >= 0; i--) {
      const m = faced(1.1, 1.46, 0.02, tex(sheet(i), { roughness: 0.8 }), mat.plastic('#d4d4d8'));
      m.position.set(i * 0.08, i * -0.06, -i * 0.09);
      m.rotation.z = i * 0.05;
      g.add(m);
      if (i === 0) top = m;
    }
    g.rotation.x = -0.15;
  }, (h) => { top.position.y = h * 0.3; top.position.z = h * 0.15; top.rotation.z = -h * 0.12; });
}

export function createLanguages() {
  let globe, tiles = [];
  return icon((g) => {
    globe = new Group();
    const ink = mat.ink(), accent = mat.plastic(BLUE);
    for (let i = 1; i < 6; i++) {
      const lat = -Math.PI / 2 + (i * Math.PI) / 6, r = Math.cos(lat) * 0.72;
      const ring = new Mesh(new TorusGeometry(r, i === 3 ? 0.02 : 0.011, 6, 64), i === 3 ? accent : ink);
      ring.rotation.x = Math.PI / 2; ring.position.y = Math.sin(lat) * 0.72;
      globe.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(new TorusGeometry(0.72, 0.011, 6, 64), ink);
      m.rotation.y = (i * Math.PI) / 6;
      globe.add(m);
    }
    globe.add(new Mesh(new SphereGeometry(0.7, 32, 16), new MeshStandardMaterial({ color: '#f6f6f6', roughness: 0.6, transparent: true, opacity: 0.7 })));
    g.add(globe);
    ['A', 'あ', 'ع', 'Я'].forEach((ch, i) => {
      const map = canvasTexture(128, 128, (c, w, h) => {
        c.fillStyle = [BLUE, '#0891b2', PINK, '#111'][i]; c.beginPath(); c.roundRect(0, 0, w, h, 20); c.fill();
        c.fillStyle = '#fff'; c.font = `600 72px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, w / 2, h / 2 + 4);
      });
      const tile = new Mesh(new PlaneGeometry(0.32, 0.32), new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, toneMapped: false }));
      tile.userData.a = (i / 4) * TAU;
      tiles.push(tile); g.add(tile);
    });
  }, (h, t) => {
    globe.rotation.y = t * (0.35 + h * 1.4);
    globe.rotation.z = 0.35;
    tiles.forEach((tile, i) => {
      const a = tile.userData.a + t * (0.5 + h * 0.8), r = 1.0 + h * 0.25;
      tile.position.set(Math.cos(a) * r, Math.sin(t * 0.9 + i) * 0.25, Math.sin(a) * r);
    });
  });
}

export function createCraft() {
  let pencil;
  return icon((g) => {
    const ruler = new Mesh(new BoxGeometry(2, 0.08, 0.5), [mat.plastic('#9a9aa0'), mat.plastic('#9a9aa0'), tex(canvasTexture(512, 92, (c, w, h) => {
      c.fillStyle = '#dedee2'; c.fillRect(0, 0, w, h); c.fillStyle = '#222';
      for (let i = 0; i <= 50; i++) c.fillRect(8 + i * 9.9, 0, 1.5, i % 10 === 0 ? 34 : i % 5 === 0 ? 24 : 14);
      c.fillStyle = blend(c, 0, 0, w, 0); c.fillRect(0, h - 10, w, 10);
    }), { roughness: 0.5 }), mat.plastic('#9a9aa0'), mat.plastic('#9a9aa0'), mat.plastic('#9a9aa0')]);
    ruler.rotation.set(0.95, 0, 0.12);
    ruler.position.y = -0.35;
    pencil = createPencil().object;
    pencil.scale.setScalar(0.95);
    pencil.position.set(0.05, 0.15, 0.25);
    pencil.rotation.set(0.3, 0, -0.75);
    g.add(ruler, pencil);
  }, (h) => { pencil.rotation.z = -0.75 - h * 0.5; pencil.position.y = 0.15 + h * 0.15; });
}

export function createFree() {
  let lid;
  return icon((g) => {
    const white = mat.ink(), ribbon = mat.plastic(PINK);
    const box = new Mesh(new BoxGeometry(1, 0.8, 1), white);
    box.position.y = -0.45;
    const r1 = new Mesh(new BoxGeometry(0.16, 0.81, 1.01), ribbon); r1.position.y = -0.45;
    const r2 = new Mesh(new BoxGeometry(1.01, 0.81, 0.16), ribbon); r2.position.y = -0.45;
    lid = new Group();
    const top = new Mesh(new BoxGeometry(1.1, 0.22, 1.1), white);
    const t1 = new Mesh(new BoxGeometry(0.17, 0.23, 1.11), ribbon);
    const t2 = new Mesh(new BoxGeometry(1.11, 0.23, 0.17), ribbon);
    const bowGeo = new TorusGeometry(0.16, 0.05, 10, 24);
    const b1 = new Mesh(bowGeo, ribbon); b1.position.set(-0.14, 0.24, 0); b1.rotation.set(0, Math.PI / 2, 0.6);
    const b2 = new Mesh(bowGeo, ribbon); b2.position.set(0.14, 0.24, 0); b2.rotation.set(0, Math.PI / 2, -0.6);
    lid.add(top, t1, t2, b1, b2);
    lid.position.y = 0.06;
    g.add(box, r1, r2, lid);
  }, (h) => { lid.position.y = 0.06 + h * 0.45; lid.rotation.set(h * 0.25, h * 0.4, -h * 0.15); });
}

// ------------------------------------------------------------------------------------------------
// Footer: the layered Folio "F"
// ------------------------------------------------------------------------------------------------

export function createLogo3D() {
  const f = new Shape();
  [[0, 0], [0.46, 0], [0.46, 0.76], [1.04, 0.76], [1.04, 1.16], [0.46, 1.16], [0.46, 1.56], [1.4, 1.56], [1.52, 2], [0, 2]]
    .forEach(([x, y], i) => (i ? f.lineTo(x - 0.72, y - 1) : f.moveTo(x - 0.72, y - 1)));
  const geo = new ExtrudeGeometry(f, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3 });
  geo.translate(0, 0, -0.11);
  const mats = [
    new MeshStandardMaterial({ color: BLUE, roughness: 0.3, metalness: 0.2 }),
    new MeshStandardMaterial({ color: CYAN, roughness: 0.3, metalness: 0.2 }),
    new MeshStandardMaterial({ color: PINK, roughness: 0.26, metalness: 0.2 })
  ];
  const g = new Group(), mark = new Group();
  const layers = mats.map((m, i) => { const l = new Mesh(geo, m); mark.add(l); return l; });
  g.add(mark, contactShadow(2.2, 1.4, 0.2, -1.35));
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 6, s.dt);
      layers.forEach((l, i) => {
        const k = i - 1; // back, middle, front
        const e = easeOut(stagger(s.enter, i, 3, 0.45));
        l.position.set(k * 0.09 * (1 + h * 1.6), k * 0.07 * (1 + h * 1.6), k * 0.32 * (1 + h * 1.8) - (1 - e) * 4);
        l.visible = e > 0.001;
      });
      mark.rotation.y = Math.sin(t * 0.6) * 0.42 * (1 - h) - 0.15 * h + (s.scroll || 0) * 0.4;
      mark.position.y = Math.sin(t * 0.9) * 0.07;
    }
  };
}
