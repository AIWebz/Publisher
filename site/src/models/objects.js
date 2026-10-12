// The site's 3D models (see kit.js for the contract): hero desk objects, install devices, principle
// icons and the layered Folio "F". Built from primitives, lathe/extrude shapes, instancing and canvas
// textures, with bump-mapped grain, bevels and small parts so they read as real objects.
import {
  Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, SphereGeometry, PlaneGeometry, LatheGeometry,
  ExtrudeGeometry, TubeGeometry, CatmullRomCurve3, Shape, Path, InstancedMesh, Object3D, Vector2, Vector3,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, DoubleSide
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  WHITE, SILVER, blend, PAPER, SANS, MONO, canvasTexture, loadImage, lines, mat, contactShadow, damp, clamp01,
  easeOut, easeInOut, stagger, glassMat, grain, bend, keycaps
} from './kit.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const tex = (map, opts = {}) => new MeshStandardMaterial({ map, roughness: 0.75, ...opts });
/** Box with a texture on its front (+z) face only. */
function faced(w, h, d, front, side, segs = 1) {
  return new Mesh(new BoxGeometry(w, h, d, segs, 1, 1), [side, side, side, side, front, side]);
}
/** A printed sheet: slight thickness, paper grain and a gentle curl. */
function sheet(w, h, map, { back = '#f1f1ee', curl = 0.04, dark = false } = {}) {
  const front = new MeshStandardMaterial({ map, roughness: 0.8, bumpMap: grain(), bumpScale: 0.6 });
  const side = new MeshStandardMaterial({ color: back, roughness: 0.85, bumpMap: grain(), bumpScale: 0.4 });
  const geo = bend(new BoxGeometry(w, h, dark ? 0.016 : 0.01, 18, 1, 1), curl);
  return new Mesh(geo, [side, side, side, side, front, side]);
}
/** Rounded rectangle path. */
function rounded(w, h, r) {
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

// ------------------------------------------------------------------------------------------------
// Hero: book, print pieces, swatch fan, pencil
// ------------------------------------------------------------------------------------------------

export async function createBook() {
  const logo = await loadImage('assets/logo-white.png');
  const W = 2, H = 2.8, D = 0.42, T = 0.06;
  const g = new Group();
  // cloth-bound boards: dark, with a woven bump map
  const cloth = new MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.78, metalness: 0.05, bumpMap: grain(), bumpScale: 1.2 });
  const coverArt = canvasTexture(1024, 1434, (c, w, h) => {
    c.fillStyle = '#1b1b1f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 3; c.strokeRect(46, 46, w - 92, h - 92);
    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 2;
    for (let x = 64; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 64; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `500 34px ${MONO}`; c.fillText('VOL. 01 — DESKTOP PUBLISHING', 112, 1290);
  });
  const cover = new MeshStandardMaterial({ map: coverArt, roughness: 0.75, bumpMap: grain(), bumpScale: 1.2 });
  // foil stamping: a mirror-silver layer that only exists where the logo and title are
  const foil = canvasTexture(1024, 1434, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    if (logo) c.drawImage(logo, 112, 140, 210, 210 * logo.height / logo.width);
    c.fillStyle = '#fff'; c.font = `700 200px ${SANS}`; c.fillText('Folio', 100, 820);
    c.font = `500 46px ${SANS}`; c.fillText('The New Era Of Design', 112, 900);
    c.fillRect(112, 1180, 800, 4);
  });
  const foilMat = new MeshStandardMaterial({ color: '#e8e8ec', metalness: 1, roughness: 0.22, alphaMap: foil, transparent: true, depthWrite: false });
  const endpaper = new MeshStandardMaterial({ roughness: 0.85, map: canvasTexture(512, 716, (c, w, h) => {
    c.fillStyle = '#e9e9ec'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 2;
    for (let i = -h; i < w; i += 22) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); }
  }) });
  const firstPage = new MeshStandardMaterial({ roughness: 0.85, bumpMap: grain(), bumpScale: 0.4, map: canvasTexture(700, 980, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    c.fillStyle = '#111'; c.font = `500 20px ${MONO}`; c.fillText('FOLIO MAGAZINE · ISSUE 01', 50, 66); c.fillText('AUTUMN', w - 150, 66);
    c.fillRect(50, 84, w - 100, 2);
    c.font = `700 76px ${SANS}`; c.fillText('The New', 50, 186); c.fillStyle = '#6b6b74'; c.fillText('Era Of Design', 50, 264);
    const ph = c.createLinearGradient(0, 300, 0, 590); ph.addColorStop(0, '#2b2b30'); ph.addColorStop(1, '#8d8d96');
    c.fillStyle = ph; c.fillRect(50, 300, w - 100, 290);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(w - 180, 420, 70, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(50, 590); c.lineTo(260, 430); c.lineTo(400, 590); c.fill();
    c.fillStyle = '#111'; c.font = `600 22px ${SANS}`; c.fillText('A calmer way to lay out pages', 50, 632);
    lines(c, 50, 660, (w - 130) / 2, 9, 30, 'rgba(0,0,0,.3)');
    lines(c, 50 + (w - 130) / 2 + 30, 660, (w - 130) / 2, 9, 30, 'rgba(0,0,0,.3)', 0.4);
  }) });
  const stripes = (vertical) => new MeshStandardMaterial({ roughness: 0.9, map: canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#f1f1ec'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.09)';
    for (let i = 0; i < 256; i += 3) vertical ? c.fillRect(i, 0, 1, h) : c.fillRect(0, i, w, 1);
  }) });
  const edgeSide = stripes(true), edgeTop = stripes(false), paper = mat.paper();

  const back = new Mesh(new RoundedBoxGeometry(W + 0.06, H + 0.08, T, 3, 0.02), cloth);
  back.position.set(0.02, 0, -D / 2 - T / 2);
  // curved spine (half a cylinder) with the title in foil
  const spineGeo = new CylinderGeometry(D / 2 + T, D / 2 + T, H + 0.08, 28, 1, true, Math.PI, Math.PI);
  const spine = new Mesh(spineGeo, cloth);
  spine.position.set(-W / 2, 0, 0);
  const spineTitle = new Mesh(new PlaneGeometry(H * 0.5, 0.14), new MeshStandardMaterial({ color: '#e8e8ec', metalness: 1, roughness: 0.22, transparent: true,
    alphaMap: canvasTexture(512, 64, (c, w, h) => { c.fillStyle = '#fff'; c.font = `700 44px ${SANS}`; c.fillText('Folio', 8, 46); c.font = `500 26px ${MONO}`; c.fillText('VOL. 01', 330, 44); }) }));
  spineTitle.rotation.set(0, -Math.PI / 2, Math.PI / 2);
  spineTitle.position.set(-W / 2 - D / 2 - T - 0.002, 0.3, 0);
  // headbands: small striped rolls at the top and bottom of the spine
  const bandMat = new MeshStandardMaterial({ roughness: 0.6, map: canvasTexture(64, 16, (c, w, h) => { for (let x = 0; x < w; x += 4) { c.fillStyle = (x / 4) % 2 ? '#d4d4d8' : '#3f3f46'; c.fillRect(x, 0, 4, h); } }) });
  for (const y of [H / 2 - 0.03, -H / 2 + 0.03]) {
    const band = new Mesh(new CylinderGeometry(0.03, 0.03, D - 0.02, 12), bandMat);
    band.rotation.x = Math.PI / 2; band.position.set(-W / 2 + 0.02, y, 0);
    g.add(band);
  }
  const pages = new Mesh(new BoxGeometry(W - 0.08, H - 0.1, D, 1, 1, 1), [edgeSide, paper, edgeTop, edgeTop, firstPage, paper]);
  pages.position.x = -0.02;
  // satin ribbon bookmark hanging out of the bottom
  const ribbonCurve = new CatmullRomCurve3([new Vector3(0.3, -H / 2 + 0.2, 0.05), new Vector3(0.32, -H / 2 - 0.1, 0.06), new Vector3(0.28, -H / 2 - 0.35, 0.18), new Vector3(0.36, -H / 2 - 0.55, 0.3)]);
  const ribbon = new Mesh(new TubeGeometry(ribbonCurve, 24, 0.035, 4, false), new MeshStandardMaterial({ color: '#c9c9cf', metalness: 0.4, roughness: 0.35 }));
  ribbon.scale.set(1, 1, 0.25);
  // front cover hinged at the spine; foil sits a hair above the cloth
  const hinge = new Group();
  hinge.position.set(-W / 2, 0, D / 2 + T / 2);
  const front = new Mesh(new RoundedBoxGeometry(W + 0.06, H + 0.08, T, 3, 0.02), [cloth]);
  front.geometry.clearGroups(); front.material = cloth;
  const frontArt = new Mesh(new PlaneGeometry(W + 0.02, H + 0.04), cover);
  frontArt.position.z = T / 2 + 0.001;
  const frontFoil = new Mesh(new PlaneGeometry(W + 0.02, H + 0.04), foilMat);
  frontFoil.position.z = T / 2 + 0.003;
  const inner = new Mesh(new PlaneGeometry(W, H), endpaper);
  inner.rotation.y = Math.PI; inner.position.z = -T / 2 - 0.001;
  const coverGroup = new Group();
  coverGroup.add(front, frontArt, frontFoil, inner);
  coverGroup.position.x = W / 2 + 0.02;
  hinge.add(coverGroup);
  const book = new Group();
  book.add(back, spine, spineTitle, pages, ribbon, hinge);
  g.add(book);
  g.children.filter((c) => c !== book).forEach((c) => book.add(c));
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

export function createFlyer() {
  const m = sheet(1.25, 1.75, canvasTexture(600, 840, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    const ph = c.createLinearGradient(0, 30, w, 420); ph.addColorStop(0, '#16161a'); ph.addColorStop(1, '#6e6e78');
    c.fillStyle = ph; c.fillRect(30, 30, w - 60, 390);
    for (let i = 0; i < 9; i++) { c.strokeStyle = `rgba(255,255,255,${0.05 + i * 0.02})`; c.lineWidth = 2; c.beginPath(); c.arc(w - 150, 210, 40 + i * 18, 0, TAU); c.stroke(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w - 150, 210, 46, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `500 18px ${MONO}`; c.fillText('SAT 14 SEP · 10:00', 56, 390);
    c.fillStyle = '#0a0a0a'; c.font = `700 78px ${SANS}`; c.fillText('Summer', 30, 510); c.fillText('Fair', 30, 586);
    c.font = `500 22px ${SANS}`; c.fillStyle = '#55555d'; c.fillText('Music · food · makers market', 32, 626);
    lines(c, 32, 660, w - 220, 4, 28, 'rgba(0,0,0,.3)');
    c.fillStyle = '#0a0a0a'; c.fillRect(32, h - 86, 190, 46);
    c.fillStyle = '#fff'; c.font = `600 20px ${SANS}`; c.fillText('Free entry', 52, h - 56);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x * 7 + y * 3 + x * y) % 3) { c.fillStyle = '#111'; c.fillRect(w - 130 + x * 14, h - 140 + y * 14, 12, 12); }
  }), { curl: 0.05 });
  return { object: m };
}

export function createCard() {
  const m = sheet(1.05, 0.62, canvasTexture(630, 372, (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#1d1d21'); bg.addColorStop(1, '#0b0b0d');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#fff'; c.font = `700 50px ${SANS}`; c.fillText('Ada Park', 44, 110);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `400 22px ${MONO}`; c.fillText('ART DIRECTOR', 46, 150);
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `400 22px ${SANS}`;
    c.fillText('ada@studio.example', 46, 270); c.fillText('+1 555 0142', 46, 304);
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 6; c.beginPath(); c.arc(w - 100, 110, 42, 0.3, TAU - 0.3); c.stroke();
  }), { back: '#141417', curl: 0.015, dark: true });
  return { object: m };
}

export function createBrochure() {
  const g = new Group();
  const panel = (i) => canvasTexture(300, 550, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    if (i === 1) {
      const ph = c.createLinearGradient(0, 0, 0, 240); ph.addColorStop(0, '#1a1a1f'); ph.addColorStop(1, '#5b5b64');
      c.fillStyle = ph; c.fillRect(0, 0, w, 240);
      c.fillStyle = '#fff'; c.font = `700 40px ${SANS}`; c.fillText('Studio', 22, 190); c.fillText('Guide', 22, 228);
      lines(c, 22, 280, w - 44, 8, 28, 'rgba(0,0,0,.3)');
    } else {
      c.fillStyle = '#111'; c.font = `700 26px ${SANS}`; c.fillText(i ? 'Workshops' : 'About us', 22, 50);
      lines(c, 22, 80, w - 44, 6, 26, 'rgba(0,0,0,.3)');
      c.fillStyle = '#c9c9cf'; c.fillRect(22, 250, w - 44, 140);
      lines(c, 22, 420, w - 44, 4, 26, 'rgba(0,0,0,.3)');
    }
  });
  const P = 0.62, H = 1.14;
  const mid = sheet(P, H, panel(1), { curl: 0.01 });
  const left = new Group(), right = new Group();
  left.position.x = -P / 2; right.position.x = P / 2;
  const l = sheet(P, H, panel(0), { curl: 0.01 }); l.position.x = -P / 2; left.add(l);
  const r = sheet(P, H, panel(2), { curl: 0.01 }); r.position.x = P / 2; right.add(r);
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
  const colors = ['#0a0a0a', '#1f1f23', '#2f2f35', '#45454d', '#5d5d66', '#7a7a84', '#9a9aa3', '#b9b9c1', '#d4d4d9', '#e8e8ec', '#f6f6f8', '#ffffff'];
  const g = new Group();
  const stripGeo = new ExtrudeGeometry(rounded(0.3, 1.95, 0.05), { depth: 0.008, bevelEnabled: false });
  stripGeo.translate(0, 0.9, 0);
  const strips = colors.map((col, i) => {
    const map = canvasTexture(80, 500, (c, w, h) => {
      c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, h);
      c.fillStyle = col; c.fillRect(0, h * 0.08, w, h * 0.66);
      c.fillStyle = '#222'; c.font = `600 11px ${SANS}`; c.fillText('FOLIO', 8, h * 0.83);
      c.font = `500 10px ${MONO}`; c.fillText(`${String(i + 1).padStart(2, '0')}-${col.slice(1, 4).toUpperCase()}`, 8, h * 0.88);
    });
    map.repeat.set(1 / 0.3, 1 / 1.95); map.offset.set(0.5, 0.5);
    const piv = new Group();
    const m = new Mesh(stripGeo, new MeshStandardMaterial({ map, roughness: 0.55 }));
    piv.add(m);
    piv.position.z = (i - colors.length / 2) * 0.011;
    g.add(piv);
    return piv;
  });
  // the rivet: a chrome cap on both sides
  const rivet = new Mesh(new CylinderGeometry(0.07, 0.07, colors.length * 0.011 + 0.04, 24), mat.aluminium());
  rivet.rotation.x = Math.PI / 2;
  const cap = new Mesh(new SphereGeometry(0.085, 20, 10, 0, TAU, 0, Math.PI / 2), mat.aluminium());
  cap.rotation.x = Math.PI / 2; cap.position.z = colors.length * 0.0055 + 0.02;
  g.add(rivet, cap);
  g.position.y = -0.6;
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 6, s.dt);
      const spread = lerp(0, 1.6, easeOut(s.enter)) + h * 0.45;
      strips.forEach((p, i) => { p.rotation.z = (i / (strips.length - 1) - 0.5) * spread; });
    }
  };
}

export function createPencil() {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.075, 0.075, 1.5, 6, 1), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, map: canvasTexture(512, 64, (c, w, h) => {
    c.fillStyle = '#18181b'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `600 22px ${SANS}`; c.fillText('FOLIO', 40, 40);
    c.font = `500 18px ${MONO}`; c.fillText('HB · 2', 150, 39);
  }) }));
  body.material.map.rotation = Math.PI / 2; body.material.map.center.set(0.5, 0.5);
  const wood = new Mesh(new ConeGeometry(0.075, 0.26, 6), new MeshStandardMaterial({ color: '#e3c49a', roughness: 0.9, bumpMap: grain(), bumpScale: 1 }));
  wood.position.y = 0.88;
  const lead = new Mesh(new ConeGeometry(0.024, 0.08, 16), new MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.6, roughness: 0.3 }));
  lead.position.y = 0.97;
  const ferrule = new Mesh(new CylinderGeometry(0.079, 0.079, 0.18, 24), mat.aluminium());
  ferrule.position.y = -0.84;
  g.add(body, wood, lead, ferrule);
  for (const y of [-0.78, -0.84, -0.9]) { const ring = new Mesh(new TorusGeometry(0.08, 0.006, 6, 24), mat.aluminium()); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  const eraser = new Mesh(new CapsuleishEraser(), new MeshStandardMaterial({ color: '#e7c3bd', roughness: 0.8 }));
  eraser.position.y = -1.0;
  g.add(eraser);
  return { object: g };
}
function CapsuleishEraser() { return new LatheGeometry([new Vector2(0, -0.09), new Vector2(0.05, -0.085), new Vector2(0.07, -0.06), new Vector2(0.074, 0), new Vector2(0.074, 0.04)], 20); }

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
  const body = new MeshStandardMaterial({ color: '#d9d9de', metalness: 0.85, roughness: 0.3, bumpMap: grain(), bumpScale: 0.15 });
  const dark = new MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.4 });
  const wall = canvasTexture(1024, 620, (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#2a2a30'); bg.addColorStop(0.55, '#8e8e98'); bg.addColorStop(1, '#e4e4e7');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.97)'; c.fillRect(150, 70, 724, 460);
    c.fillStyle = '#ececee'; c.fillRect(150, 70, 724, 46);
    c.fillStyle = '#c4c4c8'; [0, 1, 2].forEach((i) => { c.beginPath(); c.arc(176 + i * 22, 93, 7, 0, TAU); c.fill(); });
    c.fillStyle = '#111'; c.font = `600 16px ${SANS}`; c.fillText('Folio — Newsletter.folio', 420, 99);
    c.fillStyle = '#f2f2f4'; c.fillRect(166, 130, 100, 386);
    for (let i = 0; i < 4; i++) { c.fillStyle = '#fff'; c.fillRect(182, 146 + i * 90, 68, 78); c.strokeStyle = '#ddd'; c.strokeRect(182, 146 + i * 90, 68, 78); }
    c.fillStyle = '#fff'; c.fillRect(320, 134, 330, 386); c.strokeStyle = '#ddd'; c.strokeRect(320, 134, 330, 386);
    const ph = c.createLinearGradient(0, 154, 0, 270); ph.addColorStop(0, '#202024'); ph.addColorStop(1, '#7c7c86');
    c.fillStyle = ph; c.fillRect(340, 154, 290, 116);
    c.fillStyle = '#111'; c.font = `700 30px ${SANS}`; c.fillText('Newsletter', 340, 310);
    lines(c, 340, 330, 290, 7, 22, 'rgba(0,0,0,.3)');
    c.fillStyle = '#f4f4f6'; c.fillRect(690, 130, 168, 386);
    for (let i = 0; i < 6; i++) { c.fillStyle = '#e1e1e5'; c.fillRect(704, 150 + i * 44, 140, 26); }
  });
  const panel = new Mesh(new RoundedBoxGeometry(2.3, 1.48, 0.06, 4, 0.025), body);
  panel.position.y = 0.42;
  const back = new Mesh(new RoundedBoxGeometry(1.4, 0.9, 0.12, 4, 0.05), body);
  back.position.set(0, 0.42, -0.06);
  const bezel = new Mesh(new PlaneGeometry(2.24, 1.36), dark);
  bezel.position.set(0, 0.47, 0.031);
  const screenMat = new MeshBasicMaterial({ map: wall, toneMapped: false });
  const screen = new Mesh(new PlaneGeometry(2.18, 1.3), screenMat);
  screen.position.set(0, 0.47, 0.032);
  const glare = new Mesh(new PlaneGeometry(2.18, 1.3), new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: canvasTexture(256, 160, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
  }) }));
  glare.position.set(0, 0.47, 0.033);
  const chin = new Mesh(new PlaneGeometry(0.3, 0.05), new MeshBasicMaterial({ toneMapped: false, transparent: true, map: canvasTexture(128, 24, (c) => { c.fillStyle = '#9a9aa2'; c.font = `600 16px ${SANS}`; c.fillText('FOLIO', 38, 18); }) }));
  chin.position.set(0, -0.255, 0.032);
  // stand: a bent aluminium arm on a flat foot
  const arm = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0.3, -0.12), new Vector3(0, -0.2, -0.2), new Vector3(0, -0.62, -0.08), new Vector3(0, -0.8, 0.05)]), 20, 0.07, 10), body);
  arm.scale.set(2.2, 1, 1);
  const foot = new Mesh(new RoundedBoxGeometry(0.9, 0.035, 0.6, 3, 0.015), body);
  foot.position.set(0, -0.82, 0.02);
  const kb = new Group();
  const kbBody = new Mesh(new RoundedBoxGeometry(1.6, 0.035, 0.5, 3, 0.015), body);
  const keys = keycaps({ width: 1.48, depth: 0.42, cols: 15, rows: 5, color: '#f4f4f6', height: 0.018 });
  keys.position.y = 0.017;
  kb.add(kbBody, keys);
  kb.position.set(-0.15, -0.82, 0.7);
  const mouse = new Mesh(new SphereGeometry(0.1, 24, 12), body);
  mouse.scale.set(0.7, 0.35, 1.1); mouse.position.set(0.9, -0.8, 0.72);
  const stand = new Group();
  stand.add(panel, back, bezel, screen, glare, chin, arm, foot);
  g.add(stand, kb, mouse, contactShadow(2.8, 1.8, 0.18, -0.84));
  let h = 0;
  return {
    object: g,
    update(t, s) {
      const e = easeOut(s.enter);
      h = damp(h, s.hover, 7, s.dt);
      g.position.y = lerp(-0.6, 0, e);
      g.rotation.y = lerp(0.8, -0.32, e) + h * 0.32 + Math.sin(t * 0.4) * 0.04;
      screenMat.color.setScalar(0.8 + h * 0.2);
    }
  };
}

function laptop({ shell, screenSrc }) {
  const g = new Group();
  const metal = new MeshStandardMaterial({ color: shell === 'silver' ? '#d6d6db' : '#3c3c43', metalness: 0.88, roughness: 0.32, bumpMap: grain(), bumpScale: 0.12 });
  const well = new MeshStandardMaterial({ color: shell === 'silver' ? '#b9b9bf' : '#2a2a30', metalness: 0.7, roughness: 0.4 });
  const base = new Mesh(new RoundedBoxGeometry(2.2, 0.07, 1.5, 4, 0.03), metal);
  base.position.y = -0.035;
  const kwell = new Mesh(new RoundedBoxGeometry(1.94, 0.01, 0.66, 2, 0.004), well);
  kwell.position.set(0, 0.001, -0.24);
  const keys = keycaps({ width: 1.86, depth: 0.6, cols: 14, rows: 5, color: shell === 'silver' ? '#121214' : '#0b0b0c', height: 0.012 });
  keys.position.set(0, 0.002, -0.24);
  const pad = new Mesh(new RoundedBoxGeometry(0.74, 0.004, 0.44, 2, 0.002), new MeshStandardMaterial({ color: shell === 'silver' ? '#c8c8ce' : '#35353c', roughness: 0.25, metalness: 0.6 }));
  pad.position.set(0, 0.001, 0.42);
  const hingeBar = new Mesh(new CylinderGeometry(0.035, 0.035, 1.7, 16), well);
  hingeBar.rotation.z = Math.PI / 2; hingeBar.position.set(0, 0.01, -0.73);
  const hinge = new Group();
  hinge.position.set(0, 0.01, -0.74);
  const lid = new Mesh(new RoundedBoxGeometry(2.2, 1.45, 0.04, 4, 0.018), metal);
  lid.position.set(0, 0.725, -0.02);
  const bezel = new Mesh(new PlaneGeometry(2.14, 1.39), new MeshStandardMaterial({ color: '#050506', roughness: 0.15, metalness: 0.2 }));
  bezel.position.set(0, 0.725, 0.001);
  const cam = new Mesh(new CircleCam(), new MeshStandardMaterial({ color: '#1c1c22', metalness: 0.5, roughness: 0.2 }));
  cam.position.set(0, 1.42, 0.002);
  const screenMat = new MeshBasicMaterial({ color: '#111', toneMapped: false });
  const screen = new Mesh(new PlaneGeometry(2.02, 1.27), screenMat);
  screen.position.set(0, 0.73, 0.002);
  screenTexture(screenSrc).then((map) => { screenMat.map = map; screenMat.color.set('#ffffff'); screenMat.needsUpdate = true; });
  hinge.add(lid, bezel, cam, screen);
  // ports on the left side, feet underneath
  for (let i = 0; i < 2; i++) { const port = new Mesh(new BoxGeometry(0.004, 0.022, 0.07), well); port.position.set(-1.101, -0.035, -0.4 + i * 0.12); g.add(port); }
  for (const [x, z] of [[-0.95, -0.6], [0.95, -0.6], [-0.95, 0.6], [0.95, 0.6]]) { const foot = new Mesh(new CylinderGeometry(0.05, 0.05, 0.012, 16), mat.ink()); foot.position.set(x, -0.075, z); g.add(foot); }
  g.add(base, kwell, keys, pad, hingeBar, hinge, contactShadow(2.8, 2, 0.2, -0.085));
  return { g, hinge, screenMat };
}
function CircleCam() { return new CylinderGeometry(0.012, 0.012, 0.002, 16).rotateX(Math.PI / 2); }

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
      screenMat.color.setScalar(screenMat.map ? 0.8 + h * 0.2 : 0.07);
      if (extra) extra.update(t, { ...s, hover: h });
    }
  };
}

export function createLaptopSilver() { return makeLaptop('silver', 'assets/editor.webp'); }

function chip() {
  const g = new Group();
  const pkg = new Mesh(new RoundedBoxGeometry(0.62, 0.06, 0.62, 2, 0.015), new MeshStandardMaterial({ color: '#17171a', roughness: 0.5, metalness: 0.3, bumpMap: grain(), bumpScale: 0.2 }));
  const spreader = new Mesh(new RoundedBoxGeometry(0.42, 0.03, 0.42, 3, 0.012), new MeshStandardMaterial({ color: '#e2e2e7', metalness: 1, roughness: 0.18,
    map: canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#e2e2e7'; c.fillRect(0, 0, w, h); c.fillStyle = '#5b5b63'; c.font = `700 30px ${SANS}`; c.fillText('FOLIO', 70, 110); c.font = `500 20px ${MONO}`; c.fillText('x86-64 · 2026', 52, 150); c.fillText('E1 4C 9A', 72, 182); }) }));
  spreader.position.y = 0.04;
  const pins = new InstancedMesh(new BoxGeometry(0.035, 0.02, 0.09), new MeshStandardMaterial({ color: '#d9d9de', metalness: 1, roughness: 0.25 }), 40);
  const o = new Object3D();
  let n = 0;
  for (let side = 0; side < 4; side++) for (let i = 0; i < 10; i++) {
    const a = -0.27 + i * 0.06;
    o.position.set(side < 2 ? a : (side === 2 ? -0.35 : 0.35), -0.01, side < 2 ? (side === 0 ? -0.35 : 0.35) : a);
    o.rotation.set(0, side < 2 ? 0 : Math.PI / 2, 0);
    o.updateMatrix(); pins.setMatrixAt(n++, o.matrix);
  }
  g.add(pkg, spreader, pins);
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
    // a brilliant cut: table, crown, girdle and pavilion turned on a lathe, faceted
    const profile = [new Vector2(0, -0.86), new Vector2(0.72, -0.08), new Vector2(0.8, 0), new Vector2(0.8, 0.06), new Vector2(0.56, 0.36), new Vector2(0, 0.36)];
    gem = new Mesh(new LatheGeometry(profile, 12), glassMat({ thickness: 1.2, dispersion: 0.6, roughness: 0.02, flatShading: true }));
    core = new Mesh(new SphereGeometry(0.16, 16, 12), new MeshStandardMaterial({ color: WHITE, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.2 }));
    core.position.y = -0.1;
    g.add(gem, core);
  }, (h, t) => { gem.rotation.set(0.25 + Math.sin(t * 0.7) * 0.1 + h * 0.4, t * 0.4 + h * 1.4, 0); core.scale.setScalar(1 + h * 0.4); });
}

export function createOwnership() {
  let shackle;
  return icon((g) => {
    const steelDark = new MeshStandardMaterial({ color: '#2a2a30', metalness: 0.9, roughness: 0.28, bumpMap: grain(), bumpScale: 0.2 });
    const body = new Mesh(new RoundedBoxGeometry(1.1, 0.9, 0.42, 4, 0.1), steelDark);
    body.position.y = -0.3;
    for (const y of [-0.06, -0.54]) { const groove = new Mesh(new BoxGeometry(1.02, 0.015, 0.425), new MeshStandardMaterial({ color: '#111114', roughness: 0.6 })); groove.position.y = y; g.add(groove); }
    const plate = new Mesh(new CylinderGeometry(0.17, 0.17, 0.03, 32), mat.aluminium());
    plate.rotation.x = Math.PI / 2; plate.position.set(0, -0.3, 0.215);
    const hole = new Mesh(new CylinderGeometry(0.055, 0.055, 0.035, 20), mat.ink());
    hole.rotation.x = Math.PI / 2; hole.position.set(0, -0.26, 0.222);
    const slot = new Mesh(new BoxGeometry(0.04, 0.12, 0.035), mat.ink());
    slot.position.set(0, -0.35, 0.222);
    shackle = new Group();
    const steel = mat.aluminium();
    const arc = new Mesh(new TorusGeometry(0.34, 0.075, 16, 40, Math.PI), steel);
    arc.position.y = 0.42;
    const legL = new Mesh(new CylinderGeometry(0.075, 0.075, 0.42, 16), steel); legL.position.set(-0.34, 0.21, 0);
    const legR = new Mesh(new CylinderGeometry(0.075, 0.075, 0.42, 16), steel); legR.position.set(0.34, 0.21, 0);
    shackle.add(arc, legL, legR);
    shackle.position.y = 0.05;
    const piv = new Group(); piv.position.x = -0.34; shackle.position.x = 0.34; piv.add(shackle);
    g.add(body, plate, hole, slot, piv);
    shackle.userData.piv = piv;
  }, (h) => { shackle.position.y = 0.05 + h * 0.28; shackle.userData.piv.rotation.y = h * 1.1; });
}

export function createPrintTrue() {
  let out;
  return icon((g) => {
    const shell = new MeshStandardMaterial({ color: '#e4e4e8', roughness: 0.45, metalness: 0.1, bumpMap: grain(), bumpScale: 0.15 });
    const dark = new MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5 });
    const body = new Mesh(new RoundedBoxGeometry(1.5, 0.5, 0.9, 4, 0.08), shell);
    body.position.y = -0.45;
    const top = new Mesh(new RoundedBoxGeometry(1.3, 0.08, 0.7, 3, 0.03), shell);
    top.position.set(0, -0.17, -0.05);
    const slot = new Mesh(new BoxGeometry(1.0, 0.04, 0.02), dark);
    slot.position.set(0, -0.36, 0.45);
    const tray = new Mesh(new RoundedBoxGeometry(1.1, 0.03, 0.5, 2, 0.01), shell);
    tray.position.set(0, -0.62, 0.62); tray.rotation.x = 0.12;
    const led = new Mesh(new SphereGeometry(0.025, 12, 8), new MeshStandardMaterial({ color: '#fff', emissive: '#ffffff', emissiveIntensity: 1 }));
    led.position.set(0.55, -0.3, 0.451);
    const page = canvasTexture(300, 400, (c, w, h) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(22, 22, w - 44, h - 44);
      c.fillStyle = PAPER; c.fillRect(34, 34, w - 68, h - 68);
      const ph = c.createLinearGradient(0, 54, 0, 170); ph.addColorStop(0, '#1d1d22'); ph.addColorStop(1, '#7d7d86');
      c.fillStyle = ph; c.fillRect(54, 54, w - 108, 116);
      c.fillStyle = '#111'; c.font = `700 30px ${SANS}`; c.fillText('Poster', 54, 212);
      lines(c, 54, 230, w - 108, 5, 22, 'rgba(0,0,0,.3)');
      c.strokeStyle = '#111'; c.lineWidth = 2;
      for (const [x, y] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]]) {
        c.beginPath(); c.moveTo(x, y < h / 2 ? 0 : h); c.lineTo(x, y < h / 2 ? 16 : h - 16); c.moveTo(x < w / 2 ? 0 : w, y); c.lineTo(x < w / 2 ? 16 : w - 16, y); c.stroke();
      }
      c.beginPath(); c.arc(w / 2, 14, 7, 0, TAU); c.moveTo(w / 2 - 12, 14); c.lineTo(w / 2 + 12, 14); c.moveTo(w / 2, 2); c.lineTo(w / 2, 26); c.stroke();
    });
    out = sheet(0.9, 1.2, page, { curl: 0.05 });
    out.rotation.x = -1.15;
    g.add(body, top, slot, tray, led, out);
  }, (h, t) => { const e = 0.35 + h * 0.4 + Math.sin(t * 2) * 0.01; out.position.set(0, -0.36 - Math.sin(1.15) * e * 0.6 + 0.02, 0.45 + Math.cos(1.15) * e * 0.9 + 0.1); });
}

export function createLanguages() {
  let globe, tiles = [];
  return icon((g) => {
    globe = new Group();
    // a dot-matrix globe: points spread evenly over a sphere (Fibonacci lattice)
    const N = 420;
    const dots = new InstancedMesh(new SphereGeometry(0.018, 6, 4), new MeshStandardMaterial({ color: '#e8e8ec', roughness: 0.3, metalness: 0.4 }), N);
    const o = new Object3D();
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      o.position.set(Math.cos(a) * r * 0.72, y * 0.72, Math.sin(a) * r * 0.72);
      o.updateMatrix(); dots.setMatrixAt(i, o.matrix);
    }
    globe.add(dots, new Mesh(new SphereGeometry(0.66, 32, 16), glassMat({ thickness: 0.8, roughness: 0.1 })));
    const ring = new Mesh(new TorusGeometry(0.98, 0.008, 8, 96), mat.aluminium());
    ring.rotation.x = Math.PI / 2.3;
    g.add(globe, ring);
    ['A', 'あ', 'ع', 'Я', 'ß', '中'].forEach((ch, i) => {
      const map = canvasTexture(128, 128, (c, w, h) => {
        c.fillStyle = i % 2 ? '#111' : '#f4f4f6'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 26); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.stroke();
        c.fillStyle = i % 2 ? '#fff' : '#111'; c.font = `600 70px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, w / 2, h / 2 + 4);
      });
      const tile = new Mesh(new PlaneGeometry(0.3, 0.3), new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, toneMapped: false }));
      tile.userData.a = (i / 6) * TAU;
      tiles.push(tile); g.add(tile);
    });
  }, (h, t) => {
    globe.rotation.y = t * (0.35 + h * 1.4);
    globe.rotation.z = 0.35;
    tiles.forEach((tile, i) => {
      const a = tile.userData.a + t * (0.5 + h * 0.8), r = 1.0 + h * 0.25;
      tile.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.42 + Math.sin(t + i) * 0.05, Math.sin(a) * r);
      tile.lookAt(0, tile.position.y, 6);
    });
  });
}

export function createCraft() {
  let pencil, square;
  return icon((g) => {
    const rulerTop = canvasTexture(768, 120, (c, w, h) => {
      c.fillStyle = '#e8e8ec'; c.fillRect(0, 0, w, h); c.fillStyle = '#222';
      for (let i = 0; i <= 100; i++) c.fillRect(10 + i * 7.4, 0, 1.5, i % 10 === 0 ? 42 : i % 5 === 0 ? 30 : 18);
      c.font = `500 16px ${MONO}`;
      for (let i = 0; i <= 10; i++) c.fillText(String(i), 6 + i * 74, 64);
      c.font = `600 14px ${SANS}`; c.fillText('FOLIO · 10 CM', w - 150, h - 16);
    });
    const ruler = new Mesh(new RoundedBoxGeometry(2, 0.06, 0.5, 2, 0.02), new MeshStandardMaterial({ color: '#c9c9cf', metalness: 0.8, roughness: 0.3 }));
    const face = new Mesh(new PlaneGeometry(1.96, 0.46), new MeshStandardMaterial({ map: rulerTop, metalness: 0.6, roughness: 0.35 }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.031;
    const rulerG = new Group(); rulerG.add(ruler, face);
    rulerG.rotation.set(0.95, 0, 0.12); rulerG.position.y = -0.4;
    // a glass set square with a hole
    const tri = new Shape(); tri.moveTo(-0.6, -0.45); tri.lineTo(0.6, -0.45); tri.lineTo(-0.6, 0.75); tri.closePath();
    const hole = new Path(); hole.moveTo(-0.42, -0.3); hole.lineTo(0.18, -0.3); hole.lineTo(-0.42, 0.3); hole.closePath(); tri.holes.push(hole);
    square = new Mesh(new ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3 }), glassMat({ thickness: 0.3 }));
    square.position.set(-0.3, 0.1, -0.2); square.rotation.set(-0.2, 0.3, 0.1);
    pencil = createPencil().object;
    pencil.scale.setScalar(0.9);
    pencil.position.set(0.25, 0.15, 0.3);
    pencil.rotation.set(0.3, 0, -0.75);
    g.add(rulerG, square, pencil);
  }, (h, t) => { pencil.rotation.z = -0.75 - h * 0.5; pencil.position.y = 0.15 + h * 0.15; square.rotation.z = 0.1 + Math.sin(t * 0.7) * 0.06 + h * 0.3; });
}

export function createFree() {
  let lid, tag;
  return icon((g) => {
    const wrap = new MeshStandardMaterial({ color: '#141417', roughness: 0.4, metalness: 0.2,
      map: canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#141417'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.06)'; for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); } }) });
    const satin = new MeshStandardMaterial({ color: '#e6e6ea', metalness: 0.55, roughness: 0.25 });
    const box = new Mesh(new RoundedBoxGeometry(1, 0.8, 1, 3, 0.03), wrap);
    box.position.y = -0.45;
    const r1 = new Mesh(new BoxGeometry(0.16, 0.81, 1.01), satin); r1.position.y = -0.45;
    const r2 = new Mesh(new BoxGeometry(1.01, 0.81, 0.16), satin); r2.position.y = -0.45;
    lid = new Group();
    const top = new Mesh(new RoundedBoxGeometry(1.1, 0.22, 1.1, 3, 0.03), wrap);
    const t1 = new Mesh(new BoxGeometry(0.17, 0.23, 1.11), satin);
    const t2 = new Mesh(new BoxGeometry(1.11, 0.23, 0.17), satin);
    const loop = new TorusGeometry(0.18, 0.045, 10, 28);
    const b1 = new Mesh(loop, satin); b1.position.set(-0.16, 0.24, 0); b1.rotation.set(0, Math.PI / 2, 0.6); b1.scale.set(1, 1, 0.55);
    const b2 = new Mesh(loop, satin); b2.position.set(0.16, 0.24, 0); b2.rotation.set(0, Math.PI / 2, -0.6); b2.scale.set(1, 1, 0.55);
    const knot = new Mesh(new SphereGeometry(0.07, 16, 10), satin); knot.position.y = 0.16;
    for (const sx of [-1, 1]) { const tail = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0.14, 0), new Vector3(sx * 0.12, 0.13, 0.12), new Vector3(sx * 0.2, 0.12, 0.3)]), 10, 0.035, 4), satin); tail.scale.set(1, 0.4, 1); lid.add(tail); }
    lid.add(top, t1, t2, b1, b2, knot);
    lid.position.y = 0.06;
    tag = new Mesh(new PlaneGeometry(0.3, 0.18), new MeshStandardMaterial({ side: DoubleSide, roughness: 0.8, map: canvasTexture(150, 90, (c, w, h) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `700 30px ${SANS}`; c.fillText('Free', 30, 58); c.beginPath(); c.arc(16, h / 2, 5, 0, TAU); c.fillStyle = '#777'; c.fill(); }) }));
    tag.position.set(0.56, -0.2, 0.5); tag.rotation.set(0, -0.5, -0.2);
    g.add(box, r1, r2, lid, tag);
  }, (h, t) => { lid.position.y = 0.06 + h * 0.45; lid.rotation.set(h * 0.25, h * 0.4, -h * 0.15); tag.rotation.z = -0.2 + Math.sin(t * 2) * 0.08; });
}

// ------------------------------------------------------------------------------------------------
// Footer: the layered Folio "F" (chrome, steel and a glass front layer)
// ------------------------------------------------------------------------------------------------

export function createLogo3D() {
  const f = new Shape();
  [[0, 0], [0.46, 0], [0.46, 0.76], [1.04, 0.76], [1.04, 1.16], [0.46, 1.16], [0.46, 1.56], [1.4, 1.56], [1.52, 2], [0, 2]]
    .forEach(([x, y], i) => (i ? f.lineTo(x - 0.72, y - 1) : f.moveTo(x - 0.72, y - 1)));
  const geo = new ExtrudeGeometry(f, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 5 });
  geo.translate(0, 0, -0.11);
  const mats = [
    new MeshStandardMaterial({ color: '#3a3a41', roughness: 0.3, metalness: 0.9, bumpMap: grain(), bumpScale: 0.1 }),
    new MeshStandardMaterial({ color: '#d0d0d6', roughness: 0.14, metalness: 1 }),
    glassMat({ thickness: 0.5, dispersion: 0.5 })
  ];
  const g = new Group(), mark = new Group();
  const layers = mats.map((m) => { const l = new Mesh(geo, m); mark.add(l); return l; });
  g.add(mark, contactShadow(2.2, 1.4, 0.2, -1.35));
  let h = 0;
  return {
    object: g,
    update(t, s) {
      h = damp(h, s.hover, 6, s.dt);
      layers.forEach((l, i) => {
        const k = i - 1;
        const e = easeOut(stagger(s.enter, i, 3, 0.45));
        l.position.set(k * 0.09 * (1 + h * 1.6), k * 0.07 * (1 + h * 1.6), k * 0.32 * (1 + h * 1.8) - (1 - e) * 4);
        l.visible = e > 0.001;
      });
      mark.rotation.y = Math.sin(t * 0.6) * 0.42 * (1 - h) - 0.15 * h + (s.scroll || 0) * 0.4;
      mark.position.y = Math.sin(t * 0.9) * 0.07;
    }
  };
}

// reused by scene.js for the large presentation laptop
export { keycaps };
export const materials = { glassMat, grain };
void [SILVER, blend, MeshPhysicalMaterial, ConeGeometry, Vector2];
