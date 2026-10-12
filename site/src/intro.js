// First-visit cutscene (about 5 s, skippable): a vortex of printed pages bursts out, spirals back
// into a stack that becomes the Folio book, the cover slams shut, the layered "F" flies in front
// and the camera rushes into it as the page fades in. Runs in the shared canvas as the intro view.
import { Group, InstancedMesh, BoxGeometry, MeshStandardMaterial, Object3D, Color, PointLight, MathUtils } from 'three';
import { BLUE, CYAN, PINK, PAPER, canvasTexture, blend, lines, clamp01, easeOut, easeInOut } from './models/kit.js';
import { createBook, createLogo3D } from './models/objects.js';

export const INTRO_END = 4.9; // seconds until the hand-off to the page starts
const N = 56;
const lerp = (a, b, t) => a + (b - a) * t;

export async function buildIntro(scene, camera, signal) {
  const pink = new PointLight(PINK, 40, 30, 1.5); pink.position.set(-5, 2, 3);
  const cyan = new PointLight(CYAN, 40, 30, 1.5); cyan.position.set(5, -1, 4);
  scene.add(pink, cyan);

  // the pages: one instanced box, a printed face, tinted copies in the accent colours
  const face = new MeshStandardMaterial({ roughness: 0.7, map: canvasTexture(256, 346, (c, w, h) => {
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    c.fillStyle = blend(c, 20, 20, w - 20, 120); c.fillRect(20, 20, w - 40, 100);
    c.fillStyle = '#111'; c.fillRect(20, 140, 150, 16);
    lines(c, 20, 172, w - 40, 7, 20, 'rgba(0,0,0,.28)');
  }) });
  const plain = new MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.8 });
  const pages = new InstancedMesh(new BoxGeometry(1, 1.35, 0.006), [plain, plain, plain, plain, face, plain], N);
  const tints = [new Color(BLUE), new Color(CYAN), new Color(PINK)], white = new Color('#ffffff');
  for (let i = 0; i < N; i++) pages.setColorAt(i, i % 7 === 3 ? tints[i % 3].clone().lerp(white, 0.35) : white);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: i * 2.39996, y: (i / N - 0.5) * 3.4, r: 2.6 + (i % 5) * 0.32, tx: Math.sin(i * 1.7), tz: Math.cos(i * 1.3) }));

  // the book and the logo share the book's resting orientation, so the stack lands inside it
  const rest = new Group();
  rest.rotation.set(0.12, -0.45, 0.04);
  rest.add(pages);
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
      pages.setMatrixAt(i, o.matrix);
    }
    pages.instanceMatrix.needsUpdate = true;
    // 2.9 s the book takes over the stack with its cover open, then slams it shut
    if (T >= 2.9 && !bookOn) { bookOn = true; book.object.visible = true; book.update(t, { dt: 10, hover: 1, enter: 1, scroll: 0 }); }
    pages.visible = T < 3.0;
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
