// Pure SVG path geometry for every SHAPE_KINDS entry, fitted to a box. No DOM access.

const f = (n) => Math.round(n * 100) / 100;

function poly(pts) {
  return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;
}

/** Points of a regular polygon / star on the unit circle (starting at the top). */
function radial(count, inner = null, startDeg = -90) {
  const pts = [];
  const n = inner === null ? count : count * 2;
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    const r = inner !== null && i % 2 ? inner : 1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Scale unit points so their bounding box fills the target box exactly. */
function fit(pts, x, y, w, h) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [px, py] of pts) { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); }
  const sw = x2 - x1 || 1, sh = y2 - y1 || 1;
  return pts.map(([px, py]) => [x + ((px - x1) / sw) * w, y + ((py - y1) / sh) * h]);
}

function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  return `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} V${f(y + h - r)} ` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)} H${f(x + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)} ` +
    `V${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`;
}

function ellipse(x, y, w, h) {
  const rx = w / 2, ry = h / 2, cx = x + rx;
  return `M${f(cx)} ${f(y)} A${f(rx)} ${f(ry)} 0 1 1 ${f(cx)} ${f(y + h)} A${f(rx)} ${f(ry)} 0 1 1 ${f(cx)} ${f(y)} Z`;
}

/** Map points from a 0..1 unit design into the box. */
const unit = (x, y, w, h) => (u, v) => [x + u * w, y + v * h];

/**
 * SVG path data for a shape inside the box (x, y, w, h).
 * @param {string} kind one of SHAPE_KINDS
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{ sides?: number, points?: number, inner?: number, radius?: number }} [p] shape parameters
 * @returns {string}
 */
export function shapePath(kind, x, y, w, h, p = {}) {
  w = Math.max(0, w); h = Math.max(0, h);
  const U = unit(x, y, w, h);
  const m = Math.min(w, h);
  switch (kind) {
    case 'rect': return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    case 'roundRect': return roundRect(x, y, w, h, p.radius > 0 ? p.radius : m * 0.16);
    case 'ellipse': return ellipse(x, y, w, h);
    case 'triangle': return poly([U(0.5, 0), U(1, 1), U(0, 1)]);
    case 'rightTriangle': return poly([U(0, 0), U(1, 1), U(0, 1)]);
    case 'diamond': return poly([U(0.5, 0), U(1, 0.5), U(0.5, 1), U(0, 0.5)]);
    case 'pentagon': return poly(fit(radial(5), x, y, w, h));
    case 'hexagon': return poly([U(0.25, 0), U(0.75, 0), U(1, 0.5), U(0.75, 1), U(0.25, 1), U(0, 0.5)]);
    case 'octagon': {
      const c = m * 0.293;
      return poly([[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]);
    }
    case 'polygon': {
      const n = Math.max(3, Math.min(64, Math.round(p.sides || 6)));
      return poly(fit(radial(n), x, y, w, h));
    }
    case 'star': {
      const n = Math.max(3, Math.min(64, Math.round(p.points || 5)));
      const inner = Math.max(0.05, Math.min(0.98, p.inner ?? 0.45));
      return poly(fit(radial(n, inner), x, y, w, h));
    }
    case 'burst': {
      const n = 14, pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = ((-90 + (360 * i) / (n * 2)) * Math.PI) / 180;
        const r = i % 2 ? 0.7 + 0.08 * ((i * 7) % 3) / 2 : 1 - 0.1 * ((i * 5) % 4) / 3;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return poly(fit(pts, x, y, w, h));
    }
    case 'arrowRight': {
      const hl = Math.min(w * 0.5, h * 0.6);
      return poly([[x, y + h * 0.25], [x + w - hl, y + h * 0.25], [x + w - hl, y], [x + w, y + h / 2], [x + w - hl, y + h], [x + w - hl, y + h * 0.75], [x, y + h * 0.75]]);
    }
    case 'arrowLeft': {
      const hl = Math.min(w * 0.5, h * 0.6);
      return poly([[x + w, y + h * 0.25], [x + hl, y + h * 0.25], [x + hl, y], [x, y + h / 2], [x + hl, y + h], [x + hl, y + h * 0.75], [x + w, y + h * 0.75]]);
    }
    case 'arrowDown': {
      const hl = Math.min(h * 0.5, w * 0.6);
      return poly([[x + w * 0.25, y], [x + w * 0.75, y], [x + w * 0.75, y + h - hl], [x + w, y + h - hl], [x + w / 2, y + h], [x, y + h - hl], [x + w * 0.25, y + h - hl]]);
    }
    case 'arrowUp': {
      const hl = Math.min(h * 0.5, w * 0.6);
      return poly([[x + w * 0.25, y + h], [x + w * 0.75, y + h], [x + w * 0.75, y + hl], [x + w, y + hl], [x + w / 2, y], [x, y + hl], [x + w * 0.25, y + hl]]);
    }
    case 'chevron': {
      const d = Math.min(w * 0.5, h * 0.5);
      return poly([[x, y], [x + w - d, y], [x + w, y + h / 2], [x + w - d, y + h], [x, y + h], [x + d, y + h / 2]]);
    }
    case 'parallelogram': {
      const o = Math.min(w * 0.25, h);
      return poly([[x + o, y], [x + w, y], [x + w - o, y + h], [x, y + h]]);
    }
    case 'trapezoid': {
      const o = Math.min(w * 0.2, h);
      return poly([[x + o, y], [x + w - o, y], [x + w, y + h], [x, y + h]]);
    }
    case 'heart': {
      const P = (u, v) => U(u, v).map(f).join(' ');
      return `M${P(0.5, 0.26)} C${P(0.5, 0.1)} ${P(0.33, 0)} ${P(0.2, 0.02)} C${P(0.04, 0.06)} ${P(0, 0.26)} ${P(0.04, 0.42)} ` +
        `C${P(0.12, 0.66)} ${P(0.38, 0.84)} ${P(0.5, 1)} C${P(0.62, 0.84)} ${P(0.88, 0.66)} ${P(0.96, 0.42)} ` +
        `C${P(1, 0.26)} ${P(0.96, 0.06)} ${P(0.8, 0.02)} C${P(0.67, 0)} ${P(0.5, 0.1)} ${P(0.5, 0.26)} Z`;
    }
    case 'cross': {
      const t = m / 3, cx = x + w / 2, cy = y + h / 2;
      return poly([[cx - t / 2, y], [cx + t / 2, y], [cx + t / 2, cy - t / 2], [x + w, cy - t / 2], [x + w, cy + t / 2], [cx + t / 2, cy + t / 2],
        [cx + t / 2, y + h], [cx - t / 2, y + h], [cx - t / 2, cy + t / 2], [x, cy + t / 2], [x, cy - t / 2], [cx - t / 2, cy - t / 2]]);
    }
    case 'ribbon':
      return poly([U(0, 0.25), U(0.12, 0.25), U(0.12, 0), U(0.88, 0), U(0.88, 0.25), U(1, 0.25), U(0.93, 0.625), U(1, 1), U(0.8, 1),
        U(0.8, 0.75), U(0.2, 0.75), U(0.2, 1), U(0, 1), U(0.07, 0.625)]);
    case 'speech': {
      const bh = h * 0.78, r = Math.min(w, bh) * 0.14;
      const t1 = x + w * 0.38, t2 = x + w * 0.2, tip = [x + w * 0.12, y + h];
      return `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)} V${f(y + bh - r)} ` +
        `A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + bh)} H${f(t1)} L${f(tip[0])} ${f(tip[1])} L${f(t2)} ${f(y + bh)} H${f(x + r)} ` +
        `A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + bh - r)} V${f(y + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`;
    }
    case 'frame': {
      const t = Math.max(1, m * 0.12);
      return `${poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])} ${poly([[x + t, y + t], [x + t, y + h - t], [x + w - t, y + h - t], [x + w - t, y + t]])}`;
    }
    default:
      return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  }
}

/** Human-readable names for the shape gallery. */
export const SHAPE_LABELS = {
  rect: 'Rectangle', roundRect: 'Rounded rectangle', ellipse: 'Oval', triangle: 'Triangle', rightTriangle: 'Right triangle',
  diamond: 'Diamond', pentagon: 'Pentagon', hexagon: 'Hexagon', octagon: 'Octagon', polygon: 'Polygon', star: 'Star',
  arrowRight: 'Right arrow', arrowLeft: 'Left arrow', arrowUp: 'Up arrow', arrowDown: 'Down arrow', chevron: 'Chevron',
  parallelogram: 'Parallelogram', trapezoid: 'Trapezoid', heart: 'Heart', cross: 'Cross', ribbon: 'Ribbon', speech: 'Speech bubble',
  burst: 'Burst', frame: 'Frame'
};

/** Linear gradient vector (objectBoundingBox units) for a CSS-style angle (180 = top to bottom). */
export function gradientVector(angle = 180) {
  const a = (angle * Math.PI) / 180;
  const sx = Math.sin(a), cy = Math.cos(a);
  return { x1: f(0.5 - sx / 2), y1: f(0.5 + cy / 2), x2: f(0.5 + sx / 2), y2: f(0.5 - cy / 2) };
}
