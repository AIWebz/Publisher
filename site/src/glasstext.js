// The hero headline as real 3D glass. Every letter is an extruded, bevelled glyph of the wide face
// (outlines from models/glyphs.js) in a physically based glass material (transmission, IOR,
// thickness, dispersion, clear coat), so the light through it genuinely refracts. Behind the letters
// sits a backdrop that only the refraction pass sees: it redraws the hero's grid lines and drifting
// light, so the glass bends the background the page really shows. The HTML headline stays in place
// (transparent) for layout, selection and screen readers; the 3D letters follow its word boxes.
import {
  Group, Mesh, ShapePath, Shape, Path, ExtrudeGeometry, MeshPhysicalMaterial, PlaneGeometry, ShaderMaterial,
  Vector2, PointLight, ShapeUtils, MathUtils
} from 'three';
import FONT from './models/glyphs.js';
import { damp, clamp01, easeOut } from './models/kit.js';

const EM = FONT.unitsPerEm;

// --- glyph outlines (absolute SVG path data: M L H V Q C Z) → polygons with holes ------------------
function parse(d) {
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const path = new ShapePath();
  let i = 0, cmd = '', x = 0, y = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/i.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); path.moveTo(x, y); cmd = 'L'; break;
      case 'L': x = num(); y = num(); path.lineTo(x, y); break;
      case 'H': x = num(); path.lineTo(x, y); break;
      case 'V': y = num(); path.lineTo(x, y); break;
      case 'Q': { const cx = num(), cy = num(); x = num(); y = num(); path.quadraticCurveTo(cx, cy, x, y); break; }
      case 'C': { const a = num(), b = num(), c = num(), e = num(); x = num(); y = num(); path.bezierCurveTo(a, b, c, e, x, y); break; }
      case 'Z': cmd = ''; break;
      default: i++;
    }
  }
  return path;
}

const inside = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/** Shapes for a glyph: contours wound like the largest one are solids, the others are holes. */
function glyphShapes(d, segments) {
  const contours = parse(d).subPaths.map((sp) => sp.getPoints(segments)).filter((pts) => pts.length > 2);
  if (!contours.length) return [];
  const area = contours.map((c) => ShapeUtils.area(c));
  const main = Math.sign(area[area.reduce((m, a, i) => (Math.abs(a) > Math.abs(area[m]) ? i : m), 0)]);
  const solids = [], holes = [];
  contours.forEach((c, i) => (Math.sign(area[i]) === main ? solids : holes).push(c));
  const shapes = solids.map((c) => new Shape(c));
  for (const h of holes) {
    const owner = solids.findIndex((s) => inside(h[0], s));
    if (owner >= 0) shapes[owner].holes.push(new Path(h));
  }
  return shapes;
}

// --- the backdrop the glass refracts: black, the hero grid (60 px, radial mask) and soft light ---
const backdropShader = {
  uniforms: { uTime: { value: 0 }, uSize: { value: new Vector2(1, 1) }, uOrigin: { value: new Vector2() }, uHero: { value: new Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; uniform vec2 uSize, uOrigin, uHero; varying vec2 vUv;
    float blob(vec2 p, vec2 c, float r) { return exp(-dot(p - c, p - c) / (r * r)); }
    void main() {
      vec2 px = uOrigin + vec2(vUv.x, 1.0 - vUv.y) * uSize;          // CSS px inside the hero
      vec2 g = mod(px + 1.0, 60.0);
      float line = (step(g.x, 1.0) + step(g.y, 1.0)) > 0.0 ? 1.0 : 0.0;
      vec2 m = (px / uHero - vec2(0.75, 0.45)) / 0.7;                 // the CSS radial mask
      float mask = 1.0 - smoothstep(0.1, 0.72, length(m));
      vec2 q = px / uHero.y;
      float t = uTime * 0.05;
      float light = blob(q, vec2(0.2 + 0.35 * sin(t), 0.25 + 0.2 * cos(t * 1.3)), 0.42) * 0.55
                  + blob(q, vec2(0.75 + 0.3 * cos(t * 0.8), 0.6 + 0.25 * sin(t)), 0.5) * 0.35
                  + blob(q, vec2(0.45 + 0.25 * sin(t * 1.7), 0.85), 0.38) * 0.4;
      // a fine diagonal sheen gives the glass something crisp to bend, like light on a wall behind it
      float sheen = smoothstep(0.92, 1.0, sin((px.x + px.y) * 0.035 + uTime * 0.25)) * 0.05;
      vec3 col = light * vec3(0.34, 0.345, 0.36) + line * max(mask, 0.35) * 0.22 + sheen;
      gl_FragColor = vec4(col, 1.0);
    }`
};

export function buildGlassHeadline(scene, camera, h1, { mobile = false } = {}) {
  const words = [...h1.querySelectorAll('.w')];
  const segs = mobile ? 5 : 8;
  const cache = new Map();
  const geometryFor = (ch, size) => {
    if (!cache.has(ch)) {
      const g = FONT.glyphs[ch];
      const shapes = g ? glyphShapes(g[1], segs) : [];
      const s = size / EM;
      const depth = 0.12 * EM; // with the rounded bevel the letters are thick, pillowy slabs of glass
      const geo = shapes.length ? new ExtrudeGeometry(shapes, {
        depth, curveSegments: segs, bevelEnabled: true, bevelThickness: 0.085 * EM, bevelSize: 0.04 * EM, bevelOffset: -0.028 * EM, bevelSegments: mobile ? 4 : 7
      }) : null;
      const adv = (g ? g[0] : EM * 0.3) * s;
      // centred on the letter so each one can pivot and float on its own
      if (geo) { geo.translate(0, 0, -depth / 2); geo.scale(s, s, s); geo.translate(-adv / 2, 0, 0); geo.computeVertexNormals(); }
      cache.set(ch, { geo, adv });
    }
    return cache.get(ch);
  };
  const glass = (accent) => new MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: accent ? 0.015 : 0.03, transmission: 1, ior: 1.5, thickness: 70,
    dispersion: 0.25, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, specularColor: '#ffffff',
    attenuationColor: '#f3f4f8', attenuationDistance: 600, envMapIntensity: 1.8
  });
  const plain = glass(false), bright = glass(true);

  const root = new Group();
  scene.add(root);
  // backdrop: drawn only into the refraction (transmission) pass, never onto the screen
  const backMat = new ShaderMaterial(backdropShader);
  const back = new Mesh(new PlaneGeometry(1, 1), backMat);
  back.onBeforeRender = (renderer) => {
    const toScreen = renderer.getRenderTarget() === null;
    backMat.colorWrite = !toScreen;
    backMat.depthWrite = !toScreen;
  };
  scene.add(back);
  const key = new PointLight('#ffffff', 3.2, 0, 0);
  scene.add(key);

  let fontSize = 0, built = [];
  const build = () => {
    root.clear();
    cache.clear();
    fontSize = parseFloat(getComputedStyle(h1).fontSize);
    built = words.map((w, wi) => {
      const accent = !!w.closest('.accent');
      const g = new Group();
      root.add(g);
      let x = 0;
      const letters = [...w.textContent.trim().toUpperCase()].map((ch, li) => {
        const { geo, adv } = geometryFor(ch, fontSize);
        const holder = new Group();
        holder.position.x = x + adv / 2;
        x += adv;
        if (geo) holder.add(new Mesh(geo, accent ? bright : plain));
        g.add(holder);
        return { holder, i: wi * 6 + li, x: holder.position.x };
      });
      return { el: w, g, letters, natural: x };
    });
  };
  build();

  const ctx = document.createElement('canvas').getContext('2d');
  let metrics = null, px = 0, py = 0, lastW = 0;
  return {
    rebuild: build,
    update(t, s, rect) {
      const cs = getComputedStyle(h1);
      if (parseFloat(cs.fontSize) !== fontSize || rect.width !== lastW) { if (parseFloat(cs.fontSize) !== fontSize) build(); lastW = rect.width; metrics = null; }
      if (!metrics) {
        ctx.font = `${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
        const m = ctx.measureText('H');
        metrics = { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent, lh: parseFloat(cs.lineHeight) || fontSize };
      }
      // camera: perspective whose z = 0 plane maps 1 world unit to 1 CSS px over the stage
      const W = rect.width, H = rect.height;
      camera.fov = 22;
      camera.position.set(0, 0, H / 2 / Math.tan(MathUtils.degToRad(camera.fov / 2)));
      camera.near = 1; camera.far = camera.position.z * 3;
      camera.lookAt(0, 0, 0);
      // backdrop fills the view well behind the letters, mapped to the hero's CSS pixels
      const hero = h1.closest('.hero').getBoundingClientRect();
      const bz = -260, k = (camera.position.z - bz) / camera.position.z;
      back.position.set(0, 0, bz);
      back.scale.set(W * k, H * k, 1);
      backMat.uniforms.uTime.value = t;
      backMat.uniforms.uSize.value.set(W, H);
      backMat.uniforms.uOrigin.value.set(rect.left - hero.left, rect.top - hero.top);
      backMat.uniforms.uHero.value.set(hero.width, hero.height);
      // letters follow the HTML word boxes; they rise in, float a little and lean toward the pointer
      px = damp(px, s.pointer.x, 4, s.dt); py = damp(py, s.pointer.y, 4, s.dt);
      root.rotation.set(py * 0.16, px * 0.24, 0);
      key.position.set(px * W * 1.4, -py * H * 2.2, 420);
      const { asc, desc, lh } = metrics;
      for (const wd of built) {
        const r = wd.el.getBoundingClientRect();
        const base = r.top + (lh - (asc + desc)) / 2 + asc;
        wd.g.position.set(r.left - rect.left - W / 2, -(base - rect.top) + H / 2, 0);
        wd.g.scale.x = wd.natural ? r.width / wd.natural : 1;
        for (const L of wd.letters) {
          const e = easeOut(clamp01((s.enter * 1.6) - L.i * 0.035));
          L.holder.position.y = (1 - e) * -fontSize * 0.9 + Math.sin(t * 1.1 + L.i * 0.7) * fontSize * 0.012;
          L.holder.rotation.set((1 - e) * -1.3 + Math.sin(t * 0.8 + L.i) * 0.03, Math.sin(t * 0.6 + L.i * 1.3) * 0.05, 0);
          L.holder.visible = e > 0.001;
        }
      }
    }
  };
}
