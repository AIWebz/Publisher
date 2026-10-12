// The hero's print studio: a desktop printer feeds out the chosen sample publication (it prints
// line by line as the sheet comes out), the sheet glides down onto the stack, and a glass loupe
// follows the pointer over the prints. Swatches and a pencil lie on the desk; soft real shadows
// fall on the page behind the canvas.
import {
  Group, Mesh, PlaneGeometry, BoxGeometry, TorusGeometry, CylinderGeometry, LatheGeometry, SphereGeometry, MeshStandardMaterial,
  MeshBasicMaterial, ShadowMaterial, DirectionalLight, Vector2, Vector3, Plane, Raycaster, CanvasTexture, SRGBColorSpace, MathUtils
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEMPLATES, drawTemplate, designFonts } from './models/designs.js';
import { createSwatchFan, createPencil } from './models/objects.js';
import { canvasTexture, glassMat, grain, damp, clamp01, easeOut, easeInOut, MONO } from './models/kit.js';

const SW = 2.1, SH = 2.97;            // an A4 sheet, in world units
const BASE = 0.16;                    // the paper stack's height
const STACK = new Vector3(0, 0, 0.45);
const SLOT = { y: 0.47, z: -1.62 };   // the printer's output slot (front face)
const EMERGE = 1.7, DROP = 0.95;      // seconds

/** Paper that prints itself: rows below uPrint show the design, the rest is blank; uCurl bends it. */
function sheetMaterial() {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, bumpMap: grain(), bumpScale: 0.2 });
  const uPrint = { value: 1 }, uCurl = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPrint = uPrint; sh.uniforms.uCurl = uCurl;
    sh.vertexShader = 'uniform float uCurl;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n float cx = position.y / ${(SH / 2).toFixed(3)}; transformed.z += uCurl * cx * cx;`);
    sh.fragmentShader = 'uniform float uPrint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 texel = texture2D(map, vMapUv);
        float printed = 1.0 - smoothstep(uPrint - 0.004, uPrint, vMapUv.y);
        diffuseColor.rgb *= mix(vec3(0.9, 0.885, 0.84), texel.rgb, printed);
        float head = (1.0 - smoothstep(0.0, 0.01, abs(vMapUv.y - uPrint))) * step(0.002, uPrint) * step(uPrint, 0.996);
        diffuseColor.rgb *= 1.0 - head * 0.45;
      #endif`);
  };
  m.userData = { uPrint, uCurl };
  return m;
}

function createPrinter() {
  const g = new Group();
  const shell = new MeshStandardMaterial({ color: '#ecebe6', roughness: 0.42, metalness: 0 });
  const trim = new MeshStandardMaterial({ color: '#cfcdc6', roughness: 0.5 });
  const dark = new MeshStandardMaterial({ color: '#121211', roughness: 0.6 });
  const body = new Mesh(new RoundedBoxGeometry(3.3, 0.94, 1.7, 5, 0.14), shell);
  body.position.set(0, 0.47, -2.47);
  const lid = new Mesh(new RoundedBoxGeometry(3.0, 0.05, 1.32, 3, 0.02), trim);
  lid.position.set(0, 0.945, -2.55);
  // the brand plate on the lid and a small panel with a status light
  const label = new Mesh(new PlaneGeometry(1.2, 0.18), new MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTexture(512, 76, (c, w, h) => {
    c.fillStyle = 'rgba(20,20,19,.55)'; c.font = `600 34px ${MONO}`; c.fillText('FOLIO  PRESS', 8, 50);
  }) }));
  label.rotation.x = -Math.PI / 2; label.position.set(-0.7, 0.973, -2.5);
  const panel = new Mesh(new RoundedBoxGeometry(0.78, 0.03, 0.24, 2, 0.01), dark);
  panel.position.set(1.05, 0.96, -1.95);
  const ledMat = new MeshBasicMaterial({ color: '#e5007d', toneMapped: false });
  const led = new Mesh(new SphereGeometry(0.03, 12, 8), ledMat);
  led.position.set(0.78, 0.98, -1.95);
  const slot = new Mesh(new BoxGeometry(2.5, 0.07, 0.06), dark);
  slot.position.set(0, SLOT.y, -1.63);
  const tray = new Mesh(new RoundedBoxGeometry(2.36, 0.03, 0.42, 2, 0.01), trim);
  tray.position.set(0, 0.2, -1.47);
  const lip = new Mesh(new BoxGeometry(2.36, 0.08, 0.03), trim);
  lip.position.set(0, 0.24, -1.27);
  for (const m of [body, lid, panel, tray, lip]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(body, lid, label, panel, led, slot, tray, lip);
  return { object: g, led: ledMat };
}

function createLoupe() {
  const g = new Group();
  const R = 0.62;
  const black = new MeshStandardMaterial({ color: '#161615', roughness: 0.35, metalness: 0.5 });
  const ring = new Mesh(new TorusGeometry(R, 0.055, 20, 72), black);
  ring.rotation.x = Math.PI / 2;
  // a bi-convex lens turned on a lathe
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push(new Vector2(Math.sin(a) * R, Math.cos(a) * 0.07)); }
  for (let i = 13; i >= 0; i--) { const a = (i / 14) * Math.PI / 2; pts.push(new Vector2(Math.sin(a) * R, -Math.cos(a) * 0.07)); }
  const lens = new Mesh(new LatheGeometry(pts, 64), glassMat({ thickness: 0.5, ior: 1.62, roughness: 0.015, dispersion: 0.35, attenuationDistance: 8 }));
  const ferrule = new Mesh(new CylinderGeometry(0.075, 0.07, 0.22, 24), new MeshStandardMaterial({ color: '#c9c7c0', metalness: 0.9, roughness: 0.25 }));
  ferrule.rotation.z = Math.PI / 2; ferrule.position.x = R + 0.16;
  const handle = new Mesh(new CylinderGeometry(0.085, 0.07, 1.15, 24), new MeshStandardMaterial({ color: '#1b1a18', roughness: 0.55 }));
  handle.rotation.z = Math.PI / 2; handle.position.x = R + 0.84;
  const cap = new Mesh(new SphereGeometry(0.085, 20, 10), handle.material);
  cap.position.x = R + 1.42;
  for (const m of [ring, ferrule, handle, cap]) m.castShadow = true;
  g.add(ring, lens, ferrule, handle, cap);
  return g;
}

export async function buildPrintStage(scene, camera, { stageEl, chips = [], reduced = false, onChange = () => {} }) {
  await designFonts();
  // sun from the upper left: real, soft shadows on an invisible floor (the page shows through)
  const sun = new DirectionalLight('#ffffff', 1.6);
  sun.position.set(-3.5, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  sun.shadow.radius = 6; sun.shadow.bias = -0.0008;
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(14, 14), new ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const desk = new Group();
  scene.add(desk);
  const printer = createPrinter();
  desk.add(printer.object);
  // the stack: paper edges on the sides, blank on top
  const edge = canvasTexture(512, 64, (c, w, h) => {
    c.fillStyle = '#e9e6de'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = `rgba(20,20,19,${0.05 + (y % 9 === 0 ? 0.06 : 0)})`; c.fillRect(0, y, w, 1); }
  });
  const paperTop = new MeshStandardMaterial({ color: '#f1efe9', roughness: 0.85, bumpMap: grain(), bumpScale: 0.2 });
  const side = new MeshStandardMaterial({ map: edge, roughness: 0.9 });
  const stack = new Mesh(new BoxGeometry(SW, BASE, SH), [side, side, paperTop, paperTop, side, side]);
  stack.position.set(STACK.x, BASE / 2, STACK.z);
  stack.castShadow = stack.receiveShadow = true;
  desk.add(stack);
  // desk props
  const fan = createSwatchFan();
  fan.object.position.y = 0;
  const fanHolder = new Group();
  fanHolder.add(fan.object);
  fanHolder.rotation.set(-Math.PI / 2, 0, 0.5);
  fanHolder.position.set(-2.55, 0.07, 1.05);
  fanHolder.scale.setScalar(0.85);
  fanHolder.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const pencil = createPencil();
  const pencilHolder = new Group();
  pencilHolder.add(pencil.object);
  pencilHolder.rotation.set(0, 0.45, Math.PI / 2);
  pencilHolder.position.set(2.05, 0.08, 1.35);
  pencilHolder.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  desk.add(fanHolder, pencilHolder);
  const loupe = createLoupe();
  desk.add(loupe);

  // sheets: a small pool; each print takes the oldest one
  const textures = new Map();
  const texture = (id) => {
    if (!textures.has(id)) {
      const t = new CanvasTexture(drawTemplate(id, 640));
      t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
      textures.set(id, t);
    }
    return textures.get(id);
  };
  const geo = new PlaneGeometry(SW, SH, 1, 24);
  const sheets = Array.from({ length: 6 }, () => {
    const mat = sheetMaterial();
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = false;
    desk.add(mesh);
    return { mesh, mat, age: -1, t0: 0, land: new Vector3(), yaw: 0 };
  });
  let order = 0, current = 0, busy = false, idle = 0, userAt = -1e9, clock = 0;
  const place = (sh, id, startAt) => {
    sh.mat.map = texture(id); sh.mat.needsUpdate = true;
    sh.t0 = startAt; sh.age = order++;
    sh.yaw = (Math.random() - 0.5) * 0.16;
    // the new print goes on top; the ones below settle a little lower
    for (const o of sheets) if (o !== sh) o.land.y = Math.max(BASE + 0.002, o.land.y - 0.004);
    sh.land.set(STACK.x + (Math.random() - 0.5) * 0.12, BASE + 0.026, STACK.z + (Math.random() - 0.5) * 0.1);
    sh.mesh.visible = true;
  };
  // the first sheet is already on the stack, printed
  place(sheets[0], TEMPLATES[0].id, -99);
  const print = (index) => {
    current = (index + TEMPLATES.length) % TEMPLATES.length;
    const sh = sheets.reduce((a, b) => (a.age < b.age ? a : b));
    place(sh, TEMPLATES[current].id, clock);
    busy = true; idle = 0;
    onChange(current);
  };
  chips.forEach((chip, i) => chip.addEventListener('click', () => { userAt = clock; if (!busy || i !== current) print(i); }));
  onChange(0);

  // pointer over the stage moves the loupe; otherwise it drifts over the prints
  const ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3();
  const lensPlane = new Plane(new Vector3(0, 1, 0), -(BASE + 0.5));
  let pointer = null;
  stageEl.addEventListener('pointermove', (e) => {
    const r = stageEl.getBoundingClientRect();
    pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }, { passive: true });
  stageEl.addEventListener('pointerleave', () => { pointer = null; });
  const lp = new Vector3(0.6, BASE + 0.5, 0.9);

  const fit = (rect) => {
    const aspect = rect.width / Math.max(1, rect.height);
    const dist = Math.max(9.4, 7.4 / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * aspect));
    camera.position.set(0, dist * 0.74, dist * 0.68);
    camera.lookAt(0, 0, -0.55);
  };

  return (t, s, rect) => {
    clock += s.dt;
    fit(rect);
    // auto-print the next sample every few seconds unless someone is choosing
    if (!busy) idle += s.dt;
    if (!reduced && !busy && idle > 3.2 && clock - userAt > 14 && document.visibilityState === 'visible') print(current + 1);
    let printing = false;
    for (const sh of sheets) {
      if (!sh.mesh.visible) continue;
      const k = reduced ? 99 : clock - sh.t0;
      const m = sh.mesh;
      if (k < EMERGE) {
        // feeding out of the slot, bottom edge first, printing as it goes
        const e = k / EMERGE;
        printing = true;
        sh.mat.userData.uPrint.value = e;
        sh.mat.userData.uCurl.value = 0.12 * e;
        m.position.set(0, SLOT.y + 0.02, SLOT.z - SH / 2 + SH * easeInOut(e) * 1.0 + 0.02);
        m.rotation.set(-Math.PI / 2 + 0.06, 0, 0);
      } else if (k < EMERGE + DROP) {
        const e = easeInOut((k - EMERGE) / DROP);
        const from = new Vector3(0, SLOT.y + 0.02, SLOT.z + SH / 2 + 0.02);
        m.position.lerpVectors(from, sh.land, e);
        m.position.y += Math.sin(e * Math.PI) * 0.35;
        m.rotation.set(-Math.PI / 2 + 0.06 * (1 - e), 0, sh.yaw * e);
        sh.mat.userData.uPrint.value = 1;
        sh.mat.userData.uCurl.value = 0.12 * (1 - e) + Math.sin(e * Math.PI) * 0.08;
      } else {
        m.position.copy(sh.land);
        m.rotation.set(-Math.PI / 2, 0, sh.yaw);
        sh.mat.userData.uPrint.value = 1;
        sh.mat.userData.uCurl.value = 0;
        if (busy && sh.age === order - 1) busy = false;
      }
    }
    printer.led.color.set(printing && Math.sin(clock * 14) > 0 ? '#e5007d' : printing ? '#6b0039' : '#e5007d');
    // loupe
    let tx, tz;
    if (pointer && !reduced) {
      ndc.set(pointer.x, pointer.y);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(lensPlane, hit)) { tx = MathUtils.clamp(hit.x, -2.8, 2.6); tz = MathUtils.clamp(hit.z, -1.0, 2.2); }
    }
    if (tx == null) { tx = Math.sin(clock * 0.35) * 0.7 + 0.2; tz = 0.6 + Math.cos(clock * 0.27) * 0.6; }
    lp.x = damp(lp.x, tx, 6, s.dt); lp.z = damp(lp.z, tz, 6, s.dt);
    const e = easeOut(clamp01(s.enter * 1.4 - 0.3));
    loupe.position.set(lp.x, BASE + 0.5 + (1 - e) * 2.5 + Math.sin(clock * 1.3) * 0.03, lp.z);
    loupe.rotation.set(Math.sin(clock * 0.7) * 0.04, -0.5 + (lp.x - tx) * 0.2, Math.cos(clock * 0.6) * 0.04);
    fan.update(t, { dt: s.dt, hover: 0, enter: s.enter, scroll: 0 });
    desk.position.y = (1 - easeOut(s.enter)) * -0.6;
  };
}
