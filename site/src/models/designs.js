// Sample publications drawn on canvas: the designs the hero's printer prints (and the no-3D
// fallback shows). Each draws an A-series portrait page (w × h, h ≈ 1.414 w) in Folio's print
// palette: paper, ink, process magenta and cyan.
export const SERIF = '"Libre Bodoni", Georgia, serif';
export const TEXT = '"Public Sans", system-ui, sans-serif';
const PAPER = '#f4f2ec', INK = '#141413', MAGENTA = '#e5007d', CYAN = '#009fe3', WARM = '#d9d3c7';

const rows = (c, x, y, w, n, gap, color = 'rgba(20,20,19,.26)', last = 0.55) => {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) c.fillRect(x, y + i * gap, i === n - 1 ? w * last : w, Math.max(2, gap * 0.34));
};
const tracked = (c, text, x, y, spacing) => {
  for (const ch of text) { c.fillText(ch, x, y); x += c.measureText(ch).width + spacing; }
};
const centred = (c, text, cx, y) => c.fillText(text, cx - c.measureText(text).width / 2, y);
const halftone = (c, x, y, w, h, color, step = 9, fade = true) => {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = color;
  for (let j = 0; j * step < h + step; j++) for (let i = 0; i * step < w + step; i++) {
    const k = fade ? 1 - j / (h / step) : 1;
    const r = step * 0.48 * Math.max(0.15, k * (0.6 + 0.4 * Math.sin(i * 0.5 + j * 0.3)));
    c.beginPath(); c.arc(x + i * step + (j % 2) * step / 2, y + j * step, r, 0, Math.PI * 2); c.fill();
  }
  c.restore();
};

export const TEMPLATES = [
  {
    id: 'poster', name: 'Poster',
    draw(c, w, h) {
      c.fillStyle = INK; c.fillRect(0, 0, w, h);
      c.fillStyle = MAGENTA; c.beginPath(); c.arc(w * 0.64, h * 0.33, w * 0.29, 0, Math.PI * 2); c.fill();
      c.strokeStyle = CYAN; c.lineWidth = w * 0.014; c.beginPath(); c.arc(w * 0.4, h * 0.41, w * 0.24, 0, Math.PI * 2); c.stroke();
      halftone(c, w * 0.08, h * 0.08, w * 0.36, h * 0.2, 'rgba(244,242,236,.5)', w * 0.026);
      c.fillStyle = PAPER;
      c.font = `italic 400 ${w * 0.25}px ${SERIF}`; c.fillText('Jazz', w * 0.07, h * 0.75);
      c.font = `600 ${w * 0.1}px ${SERIF}`; c.fillText('in the Garden', w * 0.075, h * 0.835);
      c.fillRect(w * 0.075, h * 0.86, w * 0.85, 2);
      c.font = `600 ${w * 0.03}px ${TEXT}`; tracked(c, 'FRIDAY 14 AUGUST · 7 PM', w * 0.075, h * 0.905, w * 0.004);
      c.font = `400 ${w * 0.03}px ${TEXT}`; c.fillText('Botanical Hall · Free entry', w * 0.075, h * 0.945);
    }
  },
  {
    id: 'flyer', name: 'Flyer',
    draw(c, w, h) {
      c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
      c.fillStyle = MAGENTA; c.fillRect(0, 0, w, h * 0.46);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.22 + i * 0.28), y = h * 0.27;
        c.fillStyle = 'rgba(244,242,236,.92)'; c.beginPath(); c.arc(x, y, w * 0.1, Math.PI, 0); c.fill();
        c.fillStyle = INK; c.fillRect(x - w * 0.09, y, w * 0.18, w * 0.09);
        c.fillStyle = CYAN; c.beginPath(); c.arc(x, y - w * 0.11, w * 0.025, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = PAPER; c.font = `600 ${w * 0.028}px ${TEXT}`; tracked(c, 'SATURDAY · SCHOOL HALL', w * 0.07, h * 0.07, w * 0.004);
      c.fillStyle = INK; c.font = `700 ${w * 0.17}px ${SERIF}`; c.fillText('Bake Sale', w * 0.07, h * 0.6);
      c.font = `italic 400 ${w * 0.06}px ${SERIF}`; c.fillText('for the new library', w * 0.075, h * 0.665);
      c.fillRect(w * 0.075, h * 0.7, w * 0.85, 2);
      c.font = `600 ${w * 0.032}px ${TEXT}`;
      [['Cakes & pies', '10 – 12'], ['Coffee corner', 'all day'], ['Raffle draw', '2 pm']].forEach(([a, b], i) => {
        c.fillText(a, w * 0.075, h * (0.75 + i * 0.05)); c.fillText(b, w * 0.925 - c.measureText(b).width, h * (0.75 + i * 0.05));
      });
      c.fillStyle = CYAN; c.beginPath(); c.arc(w * 0.82, h * 0.52, w * 0.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = PAPER; c.font = `700 ${w * 0.05}px ${SERIF}`; centred(c, '€1', w * 0.82, h * 0.535);
    }
  },
  {
    id: 'newsletter', name: 'Newsletter',
    draw(c, w, h) {
      c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
      c.fillStyle = INK;
      c.font = `600 ${w * 0.12}px ${SERIF}`; centred(c, 'The Ledger', w / 2, h * 0.1);
      c.fillRect(w * 0.06, h * 0.125, w * 0.88, 3); c.fillRect(w * 0.06, h * 0.155, w * 0.88, 1);
      c.font = `500 ${w * 0.022}px ${TEXT}`; c.fillText('NO. 12 · AUTUMN', w * 0.06, h * 0.146); const t = 'FOUR PAGES'; c.fillText(t, w * 0.94 - c.measureText(t).width, h * 0.146);
      const g = c.createLinearGradient(0, h * 0.18, w, h * 0.45); g.addColorStop(0, '#20201e'); g.addColorStop(1, '#8b8a86');
      c.fillStyle = g; c.fillRect(w * 0.06, h * 0.18, w * 0.88, h * 0.26);
      halftone(c, w * 0.06, h * 0.18, w * 0.88, h * 0.26, 'rgba(0,159,227,.35)', w * 0.02, false);
      c.fillStyle = INK; c.font = `700 ${w * 0.062}px ${SERIF}`; c.fillText('The quiet art of', w * 0.06, h * 0.5); c.fillText('a garden in fall', w * 0.06, h * 0.545);
      const col = (w * 0.88 - w * 0.08) / 3;
      for (let k = 0; k < 3; k++) rows(c, w * 0.06 + k * (col + w * 0.04), h * 0.58, col, k === 1 ? 7 : 16, h * 0.022);
      c.fillStyle = MAGENTA; c.font = `italic 400 ${w * 0.05}px ${SERIF}`;
      c.fillText('“Plant now,', w * 0.38, h * 0.76); c.fillText('bloom in May.”', w * 0.38, h * 0.8);
      rows(c, w * 0.06 + 1 * (col + w * 0.04), h * 0.83, col, 5, h * 0.022);
    }
  },
  {
    id: 'menu', name: 'Menu',
    draw(c, w, h) {
      c.fillStyle = '#efe9dd'; c.fillRect(0, 0, w, h);
      c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(w * 0.05, w * 0.05, w * 0.9, h - w * 0.1); c.strokeRect(w * 0.065, w * 0.065, w * 0.87, h - w * 0.13);
      c.fillStyle = INK; c.font = `italic 400 ${w * 0.11}px ${SERIF}`; centred(c, 'Trattoria', w / 2, h * 0.14);
      c.font = `600 ${w * 0.03}px ${TEXT}`; c.fillStyle = MAGENTA; const s = 'L U C I A'; centred(c, s, w / 2, h * 0.185);
      const section = (title, y, items) => {
        c.fillStyle = INK; c.font = `600 ${w * 0.045}px ${SERIF}`; centred(c, title, w / 2, y);
        items.forEach(([name, price], i) => {
          const yy = y + h * (0.05 + i * 0.042);
          c.font = `400 ${w * 0.032}px ${TEXT}`; c.fillText(name, w * 0.14, yy);
          const pw = c.measureText(price).width; c.fillText(price, w * 0.86 - pw, yy);
          c.fillStyle = 'rgba(20,20,19,.35)'; for (let x = w * 0.14 + c.measureText(name).width + 8; x < w * 0.86 - pw - 8; x += 7) c.fillRect(x, yy - 3, 2, 2);
          c.fillStyle = INK;
        });
      };
      section('Antipasti', h * 0.27, [['Bruschetta al pomodoro', '7'], ['Burrata e fichi', '11'], ['Carpaccio di manzo', '13']]);
      section('Primi', h * 0.5, [['Tagliatelle al ragù', '15'], ['Risotto ai funghi', '16'], ['Gnocchi burro e salvia', '14']]);
      section('Dolci', h * 0.73, [['Tiramisù', '7'], ['Panna cotta', '6']]);
      c.fillStyle = CYAN; c.fillRect(w * 0.44, h * 0.9, w * 0.12, 3);
    }
  },
  {
    id: 'invitation', name: 'Invitation',
    draw(c, w, h) {
      c.fillStyle = '#f6f1ea'; c.fillRect(0, 0, w, h);
      c.strokeStyle = MAGENTA; c.lineWidth = 3; c.strokeRect(w * 0.07, w * 0.07, w * 0.86, h - w * 0.14);
      c.lineWidth = 1; c.strokeRect(w * 0.09, w * 0.09, w * 0.82, h - w * 0.18);
      c.fillStyle = INK; c.font = `500 ${w * 0.026}px ${TEXT}`; const k = 'TOGETHER WITH THEIR FAMILIES'; centred(c, k, w / 2, h * 0.2);
      c.font = `italic 400 ${w * 0.15}px ${SERIF}`; centred(c, 'Isabel', w / 2, h * 0.37);
      c.fillStyle = MAGENTA; c.font = `italic 400 ${w * 0.08}px ${SERIF}`; centred(c, '&', w / 2, h * 0.45);
      c.fillStyle = INK; c.font = `italic 400 ${w * 0.15}px ${SERIF}`; centred(c, 'Thomas', w / 2, h * 0.56);
      c.font = `400 ${w * 0.034}px ${SERIF}`; centred(c, 'request the pleasure of your company', w / 2, h * 0.65);
      c.font = `600 ${w * 0.03}px ${TEXT}`; centred(c, 'SATURDAY, 12 JUNE · FOUR O’CLOCK', w / 2, h * 0.73);
      c.font = `400 ${w * 0.03}px ${TEXT}`; centred(c, 'The Orangery, Kew', w / 2, h * 0.77);
      c.fillStyle = CYAN; c.beginPath(); c.arc(w / 2, h * 0.85, w * 0.012, 0, Math.PI * 2); c.fill();
    }
  }
];

/** Draw a template onto a new canvas (w px wide, A-series portrait). */
export function drawTemplate(id, w = 512) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0];
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round(w * 1.414);
  t.draw(c.getContext('2d'), c.width, c.height);
  return c;
}

/** Wait for the faces the designs use (canvas text needs them loaded first). */
export function designFonts() {
  return Promise.all([
    `600 40px ${SERIF}`, `700 40px ${SERIF}`, `italic 400 40px ${SERIF}`, `400 20px ${TEXT}`, `600 20px ${TEXT}`
  ].map((f) => document.fonts.load(f).catch(() => null)));
}

export { PAPER, INK, MAGENTA, CYAN, WARM };
