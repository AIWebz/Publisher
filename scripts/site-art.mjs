// Draws the download website's scenery as SVG: a meadow of grass and flowers with ancient columns at
// sunset (rendered to site/assets/field.jpg), a strip of meadow that ends each section (meadow-strip.svg) and a
// single column (column.svg). Seeded, so it draws the same every time: node scripts/site-art.mjs
import { writeFileSync } from 'node:fs';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const r = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const f = (n) => Math.round(n * 10) / 10;

const defs = `
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060914"/><stop offset=".34" stop-color="#14204a"/><stop offset=".56" stop-color="#4a3c6e"/><stop offset=".7" stop-color="#b56a64"/><stop offset=".79" stop-color="#f0a865"/><stop offset=".84" stop-color="#fcd796"/></linearGradient>
<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".12" stop-color="#ffe2a0" stop-opacity=".95"/><stop offset=".35" stop-color="#f8b26c" stop-opacity=".45"/><stop offset="1" stop-color="#f08a5d" stop-opacity="0"/></radialGradient>
<linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d5466"/><stop offset=".45" stop-color="#b9a895"/><stop offset=".8" stop-color="#f3d8b0"/><stop offset="1" stop-color="#c9ac8c"/></linearGradient>
<linearGradient id="stoneFar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b5e74"/><stop offset=".7" stop-color="#d9b796"/><stop offset="1" stop-color="#b59a86"/></linearGradient>
<linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f6a86"/><stop offset="1" stop-color="#4c5a6e"/></linearGradient>
<linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a7a5c"/><stop offset="1" stop-color="#2f4d3a"/></linearGradient>
<linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8f45"/><stop offset=".35" stop-color="#3f6a33"/><stop offset="1" stop-color="#132a1a"/></linearGradient>
<filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="haze"><feGaussianBlur stdDeviation="3"/></filter>`;

function column(x, base, h, w, { broken = 0, fill = 'url(#stone)', capital = true } = {}) {
  const top = base - h, shaftTop = top + (capital ? w * 0.42 : 0);
  let s = `<g>`;
  s += `<rect x="${f(x - w * 0.62)}" y="${f(base - w * 0.22)}" width="${f(w * 1.24)}" height="${f(w * 0.22)}" fill="${fill}"/>`;
  s += `<rect x="${f(x - w * 0.56)}" y="${f(base - w * 0.34)}" width="${f(w * 1.12)}" height="${f(w * 0.13)}" fill="${fill}"/>`;
  const bt = broken ? base - h * (1 - broken) : shaftTop;
  const tw = w * 0.86;
  if (broken) {
    const j = [r(-.2, .2), r(-.25, .25), r(-.15, .15)].map((v) => v * w);
    s += `<path d="M${f(x - w / 2)} ${f(base - w * 0.34)} L${f(x - tw / 2)} ${f(bt + j[0])} L${f(x - w * 0.1)} ${f(bt - w * 0.25 + j[1])} L${f(x + w * 0.15)} ${f(bt + j[2])} L${f(x + tw / 2)} ${f(bt - w * 0.12)} L${f(x + w / 2)} ${f(base - w * 0.34)}Z" fill="${fill}"/>`;
  } else {
    s += `<path d="M${f(x - w / 2)} ${f(base - w * 0.34)} L${f(x - tw / 2)} ${f(shaftTop)} L${f(x + tw / 2)} ${f(shaftTop)} L${f(x + w / 2)} ${f(base - w * 0.34)}Z" fill="${fill}"/>`;
    if (capital) {
      s += `<path d="M${f(x - tw / 2)} ${f(shaftTop)} Q${f(x - w * 0.7)} ${f(shaftTop - w * 0.08)} ${f(x - w * 0.66)} ${f(top + w * 0.16)} L${f(x + w * 0.66)} ${f(top + w * 0.16)} Q${f(x + w * 0.7)} ${f(shaftTop - w * 0.08)} ${f(x + tw / 2)} ${f(shaftTop)}Z" fill="${fill}"/>`;
      s += `<rect x="${f(x - w * 0.72)}" y="${f(top)}" width="${f(w * 1.44)}" height="${f(w * 0.17)}" fill="${fill}"/>`;
    }
  }
  // flutes and shadow side
  const ft = broken ? bt : shaftTop;
  for (let k = -3; k <= 3; k++) {
    const xb = x + (k / 7) * w, xt = x + (k / 7) * tw;
    s += `<path d="M${f(xb)} ${f(base - w * 0.36)} L${f(xt)} ${f(ft + 2)}" stroke="#000" stroke-opacity="${k < 0 ? .22 : .1}" stroke-width="${f(w * 0.035)}"/>`;
  }
  s += `<path d="M${f(x - w / 2)} ${f(base - w * 0.34)} L${f(x - tw / 2)} ${f(ft)} L${f(x - tw * 0.18)} ${f(ft)} L${f(x - w * 0.22)} ${f(base - w * 0.34)}Z" fill="#1a1530" opacity=".28"/>`;
  return s + `</g>`;
}

function blades(n, x0, x1, y0, y1, hmin, hmax, colors, wmax = 2.4) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r(x0, x1), y = r(y0, y1), h = r(hmin, hmax) * (0.6 + (y - y0) / Math.max(1, y1 - y0) * 0.6), bend = r(-0.45, 0.45) * h;
    s += `<path d="M${f(x)} ${f(y)} q${f(bend * 0.3)} ${f(-h * 0.5)} ${f(bend)} ${f(-h)}" stroke="${pick(colors)}" stroke-width="${f(r(0.8, wmax))}" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

const PETALS = ['#ffffff', '#fff3c4', '#ffd166', '#f4a7c1', '#c9a7f4', '#e5484d', '#ffe9f0'];
function flowers(n, x0, x1, y0, y1, smin, smax) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r(x0, x1), y = r(y0, y1), z = (y - y0) / Math.max(1, y1 - y0), size = r(smin, smax) * (0.5 + z * 0.8), c = pick(PETALS);
    if (size < 2.6) { s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size * 0.7)}" fill="${c}"/>`; continue; }
    s += `<path d="M${f(x)} ${f(y + size * 3)} q${f(r(-2, 2))} ${f(-size * 1.5)} 0 ${f(-size * 3)}" stroke="#2e5a2a" stroke-width="${f(size * 0.22)}" fill="none"/>`;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r(0, 1);
      s += `<circle cx="${f(x + Math.cos(a) * size * 0.75)}" cy="${f(y + Math.sin(a) * size * 0.6)}" r="${f(size * 0.55)}" fill="${c}"/>`;
    }
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size * 0.36)}" fill="${c === '#ffd166' ? '#8a4b12' : '#f5b700'}"/>`;
  }
  return s;
}

const GRASS_FAR = ['#7a9a4a', '#88a856', '#6b8c40', '#9bb565'];
const GRASS_MID = ['#4f7f36', '#5e8f3c', '#3f6e2e', '#6a9a45', '#7aa24f'];
const GRASS_NEAR = ['#2f5e27', '#3b6e2c', '#244d20', '#4d8034', '#1d3f1b', '#5a8c3a'];

// ---- the whole scene, 1920 × 1080 ----
{
  const W = 1920, H = 1080, HZ = 760;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice"><defs>${defs}</defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 90; i++) s += `<circle cx="${f(r(0, W))}" cy="${f(r(0, 380))}" r="${f(r(.4, 1.4))}" fill="#fff" opacity="${f(r(.2, .8))}"/>`;
  s += `<circle cx="1180" cy="${HZ - 30}" r="420" fill="url(#sun)"/>`;
  s += `<circle cx="1180" cy="${HZ - 112}" r="40" fill="#fff4d6" opacity=".95"/>`;
  s += `<path d="M0 ${HZ - 40} C 260 ${HZ - 120} 520 ${HZ - 70} 760 ${HZ - 95} S 1240 ${HZ - 60} 1500 ${HZ - 110} S 1820 ${HZ - 70} 1920 ${HZ - 90} V ${H} H 0Z" fill="url(#hill1)" opacity=".85" filter="url(#haze)"/>`;
  s += `<path d="M0 ${HZ + 10} C 300 ${HZ - 40} 600 ${HZ + 10} 900 ${HZ - 20} S 1500 ${HZ + 20} 1920 ${HZ - 30} V ${H} H 0Z" fill="url(#hill2)"/>`;
  // a ruined colonnade on the far rise
  s += `<g opacity=".92">`;
  const cx0 = 1290, gap = 74, cb = HZ - 2;
  s += `<rect x="${cx0 - 50}" y="${cb - 4}" width="${gap * 6 + 100}" height="14" fill="url(#stoneFar)"/>`;
  [[0, 0], [1, 0], [2, 0], [3, 0.45], [4, 0], [5, 0.7], [6, 0.3]].forEach(([k, b]) => { s += column(cx0 + k * gap, cb, 210, 30, { broken: b, fill: 'url(#stoneFar)' }); });
  s += `<rect x="${cx0 - 24}" y="${cb - 226}" width="${gap * 2 + 48}" height="18" fill="url(#stoneFar)"/><rect x="${cx0 - 20}" y="${cb - 244}" width="${gap * 2 + 40}" height="16" fill="url(#stoneFar)"/>`;
  s += `<path d="M${cx0 - 22} ${cb - 244} L${cx0 + gap} ${cb - 300} L${cx0 + gap * 2 + 22} ${cb - 244}Z" fill="url(#stoneFar)" opacity=".9"/>`;
  s += `<rect x="${cx0 + gap * 4 - 20}" y="${cb - 226}" width="${gap + 40}" height="16" fill="url(#stoneFar)"/>`;
  s += `</g>`;
  s += `<path d="M0 ${HZ + 40} C 400 ${HZ} 800 ${HZ + 50} 1200 ${HZ + 20} S 1700 ${HZ + 40} 1920 ${HZ + 10} V ${H} H 0Z" fill="url(#field)"/>`;
  s += `<g filter="url(#soft)">${blades(1400, 0, W, HZ + 20, HZ + 140, 6, 14, GRASS_FAR, 1.4)}${flowers(500, 0, W, HZ + 30, HZ + 150, 1, 2.4)}</g>`;
  s += blades(1500, -20, W + 20, HZ + 110, HZ + 260, 14, 34, GRASS_MID, 2);
  s += flowers(260, 0, W, HZ + 140, HZ + 270, 2.4, 4.6);
  // large columns in the foreground, framing the scene
  s += column(150, H + 30, 760, 118, {});
  s += column(380, H + 40, 470, 104, { broken: 0.35 });
  s += column(1790, H + 30, 820, 124, {});
  s += `<rect x="-20" y="${H + 30 - 760 - 4}" width="560" height="0" fill="none"/>`;
  s += blades(1300, -20, W + 20, HZ + 230, H + 30, 34, 80, GRASS_NEAR, 3.2);
  s += flowers(140, 0, W, HZ + 250, H, 4.5, 8.5);
  s += `<rect width="${W}" height="${H}" fill="url(#sky)" opacity="0"/>`;
  writeFileSync('site/assets/field.svg', s + '</svg>\n');
}

// ---- a strip of meadow, 1920 × 180, that ends a section ----
{
  const W = 1920, H = 180;
  seed = 11;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">`;
  s += `<path d="M0 ${H - 60} C 400 ${H - 90} 900 ${H - 50} 1300 ${H - 80} S 1800 ${H - 60} 1920 ${H - 70} V ${H} H 0Z" fill="#1d3a1e"/>`;
  s += blades(900, 0, W, H - 70, H - 30, 8, 20, GRASS_MID, 1.8);
  s += flowers(170, 0, W, H - 70, H - 20, 1.6, 3.6);
  s += blades(900, -10, W + 10, H - 40, H + 6, 18, 44, GRASS_NEAR, 2.6);
  s += flowers(70, 0, W, H - 40, H, 3, 6);
  writeFileSync('site/assets/meadow-strip.svg', s + '</svg>\n');
}

// ---- one column, for the sides of a section ----
{
  seed = 3;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 1000" preserveAspectRatio="xMidYMax meet"><defs>${defs}</defs>`;
  s += column(100, 1000, 990, 130, {});
  writeFileSync('site/assets/column.svg', s + '</svg>\n');
}
console.log('site art written');
