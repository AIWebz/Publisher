// First-visit cutscene (about 5 s, skippable): a vortex of printed pages bursts out, spirals back
// into a stack that becomes the Folio book, the cover slams shut, the layered "F" flies in front
// and the camera rushes into it as the page fades in. Runs in the shared canvas as the intro view.
import { Group, InstancedMesh, BoxGeometry, MeshStandardMaterial, Object3D, Color, PointLight, MathUtils, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, AdditiveBlending } from 'three';
import { PAPER, SANS, MONO, canvasTexture, lines, clamp01, easeOut, easeInOut, grain, bend } from './models/kit.js';
import { createBook, createLogo3D } from './models/objects.js';

export const INTRO_END = 4.9; // seconds until the hand-off to the page starts
const N = 56;
const lerp = (a, b, t) => a + (b - a) * t;

export async function buildIntro(scene, camera, signal) {
  const left = new PointLight('#ffffff', 34, 30, 1.5); left.position.set(-5, 2, 3);
  const right = new PointLight('#d4d4d8', 34, 30, 1.5); right.position.set(5, -1, 4);
  scene.add(left, right);

  // the pages: four printed designs (magazine cover, poster, newsletter, photo spread) on curled,
  // grained paper; each design is one instanced mesh and every page keeps its own place in the swirl
  const photo = (c, x, y, w, h) => { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#1a1a1f'); g.addColorStop(1, '#8a8a94'); c.fillStyle = g; c.fillRect(x, y, w, h); };
  const designs = [
    (c, w, h) => { photo(c, 0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 54px ${SANS}`; c.fillText('Folio', 22, 70); c.font = `500 14px ${MONO}`; c.fillText('ISSUE 01 · AUTUMN', 24, 96); c.font = `700 30px ${SANS}`; c.fillText('The New', 22, h - 70); c.fillText('Era Of Design', 22, h - 34); },
    (c, w, h) => { c.fillStyle = PAPER; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.beginPath(); c.arc(w / 2, 130, 90, 0, Math.PI * 2); c.fill(); c.fillStyle = PAPER; c.beginPath(); c.arc(w / 2 + 30, 110, 40, 0, Math.PI * 2); c.fill(); c.fillStyle = '#111'; c.font = `700 40px ${SANS}`; c.fillText('Summer', 22, 280); c.fillText('Fair', 22, 318); lines(c, 22, 336, w - 44, 2, 16, 'rgba(0,0,0,.35)'); },
    (c, w, h) => { c.fillStyle = PAPER; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `700 26px ${SANS}`; c.fillText('The Ledger', 20, 38); c.fillRect(20, 48, w - 40, 2); photo(c, 20, 60, w - 40, 96); lines(c, 20, 172, (w - 50) / 2, 8, 18, 'rgba(0,0,0,.3)'); lines(c, 30 + (w - 50) / 2, 172, (w - 50) / 2, 8, 18, 'rgba(0,0,0,.3)', 0.4); },
    (c, w, h) => { c.fillStyle = PAPER; c.fillRect(0, 0, w, h); photo(c, 0, 0, w, 200); c.fillStyle = '#111'; c.font = `700 24px ${SANS}`; c.fillText('Studio Guide', 20, 236); lines(c, 20, 256, w - 40, 5, 18, 'rgba(0,0,0,.3)'); }
  ];
  const back = new MeshStandardMaterial({ color: '#efefec', roughness: 0.85, bumpMap: grain(), bumpScale: 0.4 });
  const pageGeo = bend(new BoxGeometry(1, 1.35, 0.006, 12, 1, 1), 0.05);
  const groups = designs.map((draw) => {
    const face = new MeshStandardMaterial({ roughness: 0.75, bumpMap: grain(), bumpScale: 0.4, map: canvasTexture(256, 346, draw) });
    return new InstancedMesh(pageGeo, [back, back, back, back, face, back], Math.ceil(N / designs.length));
  });
  const slot = (i) => [groups[i % groups.length], Math.floor(i / groups.length)];
  // light motes swirling with the pages
  const M = 260, mp = new Float32Array(M * 3), mseed = Array.from({ length: M }, (_, i) => ({ a: i * 2.39996, r: 1.5 + (i % 13) * 0.25, y: ((i * 37) % 100) / 100 - 0.5, s: 0.4 + (i % 7) * 0.12 }));
  const motesGeo = new BufferGeometry();
  motesGeo.setAttribute('position', new Float32BufferAttribute(mp, 3));
  const motes = new Points(motesGeo, new PointsMaterial({ color: '#ffffff', size: 0.035, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
  scene.add(motes);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: i * 2.39996, y: (i / N - 0.5) * 3.4, r: 2.6 + (i % 5) * 0.32, tx: Math.sin(i * 1.7), tz: Math.cos(i * 1.3) }));

  // the book and the logo share the book's resting orientation, so the stack lands inside it
  const rest = new Group();
  rest.rotation.set(0.12, -0.45, 0.04);
  rest.add(...groups);
  scene.add(rest);
  const book = await createBook();
  book.object.visible = false;
  scene.add(book.object);
  const logo = createLogo3D();
  logo.object.visible = false;
  logo.object.scale.setScalar(0.62);
  logo.object.position.set(0.15, -0.1, 1.9);
  scene.add(logo.object);

  const o = new Object3D();
  let clock = 0, ended = false, titled = false, bookOn = false;
  return (t, s) => {
    // advance by the (capped) frame time so a slow frame never skips a beat of the scene
    clock += s.dt * (signal.timeScale || 1);
    const T = signal.skip ? INTRO_END + 1 : clock;
    signal.progress = clamp01(T / INTRO_END);
    // 0–1.8 s burst into a vortex, 1.8–3.0 s spiral back into a stack
    const burst = easeOut(clamp01(T / 1.8));
    const gather = easeInOut(clamp01((T - 1.8) / 1.2));
    for (let i = 0; i < N; i++) {
      const sd = seeds[i];
      const ang = sd.a + T * 1.15;
      const r = sd.r * burst;
      const vx = Math.cos(ang) * r, vz = Math.sin(ang) * r, vy = sd.y * burst;
      const sz = -0.2 + (i / (N - 1)) * 0.4;
      o.position.set(lerp(vx, -0.035, gather), lerp(vy, 0, gather), lerp(vz, sz, gather));
      o.rotation.set(lerp(sd.tx * 0.9 * burst, 0, gather), lerp(-ang + Math.PI / 2, 0, gather), lerp(sd.tz * 0.7 * burst, 0, gather));
      const grow = clamp01(T * 3 - i * 0.012);
      o.scale.set(lerp(1, 1.93, gather) * grow, lerp(1, 2.01, gather) * grow, 1);
      o.updateMatrix();
      const [mesh, k] = slot(i);
      mesh.setMatrixAt(k, o.matrix);
    }
    for (const m of groups) m.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < M; i++) {
      const sd = mseed[i], a = sd.a + T * sd.s * 1.4, r = sd.r * (0.3 + burst * 0.9) * (1 - gather * 0.55);
      mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = sd.y * 4 * (0.4 + burst * 0.6) + Math.sin(T * 2 + i) * 0.05; mp[i * 3 + 2] = Math.sin(a) * r;
    }
    motesGeo.attributes.position.needsUpdate = true;
    motes.material.opacity = 0.8 * clamp01(T * 2) * (1 - clamp01((T - 4.2) / 0.6));
    // 2.9 s the book takes over the stack with its cover open, then slams it shut
    if (T >= 2.9 && !bookOn) { bookOn = true; book.object.visible = true; book.update(t, { dt: 10, hover: 1, enter: 1, scroll: 0 }); }
    for (const m of groups) m.visible = T < 3.0;
    if (bookOn) {
      book.update(t, { dt: s.dt, hover: T < 3.15 ? 1 : 0, enter: 1, scroll: 0 });
      const thump = Math.exp(-Math.max(0, T - 3.55) * 9) * (T > 3.55 ? 1 : 0);
      book.object.scale.setScalar(1 + thump * 0.04);
      book.object.position.y = -thump * 0.05;
    }
    // 3.4 s the layered F flies in front
    if (T >= 3.4) {
      logo.object.visible = true;
      logo.update(t, { dt: s.dt, hover: 0, enter: clamp01((T - 3.4) / 1.0), scroll: 0 });
    }
    if (T >= 3.55 && !titled) { titled = true; document.documentElement.classList.add('intro-title-in'); }
    // camera: a slow orbit, then a rush into the logo for the hand-off
    const orbit = easeInOut(clamp01(T / 4.4));
    const rush = easeInOut(clamp01((T - 4.3) / 0.9));
    const ang = lerp(-0.85, 0.2, orbit);
    const R = lerp(lerp(11, 8.2, orbit), 2.4, rush);
    const shake = T > 3.55 && T < 3.85 ? Math.sin(T * 90) * 0.03 * (3.85 - T) / 0.3 : 0;
    camera.position.set(Math.sin(ang) * R + shake, lerp(1.6, 0.5, orbit) * (1 - rush * 0.7), Math.cos(ang) * R);
    camera.lookAt(0, lerp(-0.85, -0.1, rush), lerp(0, 1.6, rush)); // the subject sits high, the title below it
    camera.fov = lerp(34, 46, rush);
    camera.updateProjectionMatrix();
    if (T >= INTRO_END && !ended) { ended = true; document.dispatchEvent(new CustomEvent('folio:intro-end')); }
    return !ended || T < INTRO_END + 1.2;
  };
}

/** Free the intro's GPU resources once it has played. */
export function disposeScene(scene) {
  scene.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    for (const mt of [].concat(m.material || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
  });
}
