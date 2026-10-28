// Colour schemes, font schemes and helpers that turn model values (which may reference the
// document theme, e.g. '@accent' or '@heading') into concrete CSS values.

export const SCHEME_KEYS = ['paper', 'ink', 'accent', 'accent2', 'muted', 'light'];
export const SCHEME_LABELS = { paper: 'Paper', ink: 'Ink', accent: 'Accent', accent2: 'Highlight', muted: 'Muted', light: 'Tint' };

export const COLOR_SCHEMES = {
  ivory:    { name: 'Ivory & Oxblood', colors: { paper: '#fbf8f1', ink: '#1f1d1a', accent: '#7d2a2a', accent2: '#b08d57', muted: '#6f685e', light: '#efe6d6' } },
  midnight: { name: 'Midnight',        colors: { paper: '#f6f2ea', ink: '#141b2d', accent: '#1f3557', accent2: '#c9a24a', muted: '#68707e', light: '#e3e7ef' } },
  sage:     { name: 'Sage',            colors: { paper: '#f5f4ee', ink: '#1e2a24', accent: '#4c6a55', accent2: '#c2a878', muted: '#7b8577', light: '#e3e9e1' } },
  rosewood: { name: 'Rosewood',        colors: { paper: '#fbf5f1', ink: '#2b1d1f', accent: '#94455a', accent2: '#d6b39c', muted: '#8a7470', light: '#f3e2e2' } },
  lagoon:   { name: 'Lagoon',          colors: { paper: '#f6f7f3', ink: '#10302e', accent: '#1d5f59', accent2: '#e0a458', muted: '#6c7a78', light: '#dceae7' } },
  plum:     { name: 'Plum & Ochre',    colors: { paper: '#faf6f0', ink: '#251a2b', accent: '#5a3e6b', accent2: '#c99a3b', muted: '#7d7183', light: '#ebe3ef' } },
  harbor:   { name: 'Harbor',          colors: { paper: '#ffffff', ink: '#13243a', accent: '#2563a6', accent2: '#f2a541', muted: '#5f6b7a', light: '#e4eef9' } },
  citrus:   { name: 'Citrus',          colors: { paper: '#fffdf7', ink: '#2a2a1e', accent: '#d9822b', accent2: '#5b8c2a', muted: '#7a7562', light: '#fbecd8' } },
  mono:     { name: 'Monochrome',      colors: { paper: '#ffffff', ink: '#141414', accent: '#3d3d3d', accent2: '#a3a3a3', muted: '#767676', light: '#eeeeee' } }
};

export const FONT_SCHEMES = {
  classic:   { name: 'Classic',   heading: 'Cormorant Garamond', body: 'EB Garamond' },
  editorial: { name: 'Editorial', heading: 'Playfair Display',   body: 'Lora' },
  modern:    { name: 'Modern',    heading: 'Fraunces',           body: 'Crimson Pro' },
  didone:    { name: 'Didone',    heading: 'Bodoni Moda',        body: 'Libre Baskerville' },
  display:   { name: 'Display',   heading: 'DM Serif Display',   body: 'Spectral' },
  clean:     { name: 'Clean',     heading: 'Inter',              body: 'Inter' },
  mixed:     { name: 'Contemporary', heading: 'Playfair Display', body: 'Inter' },
  bold:      { name: 'Bold',      heading: 'Montserrat',         body: 'Work Sans' },
  poster:    { name: 'Poster',    heading: 'Bebas Neue',         body: 'Montserrat' },
  news:      { name: 'News',      heading: 'Oswald',             body: 'Lora' },
  slab:      { name: 'Slab',      heading: 'Roboto Slab',        body: 'Nunito' },
  geometric: { name: 'Geometric', heading: 'Josefin Sans',       body: 'Raleway' },
  fashion:   { name: 'Fashion',   heading: 'Abril Fatface',      body: 'Raleway' },
  impact:    { name: 'Impact',    heading: 'Archivo Black',      body: 'Work Sans' },
  script:    { name: 'Script',    heading: 'Great Vibes',        body: 'Josefin Sans' },
  romantic:  { name: 'Romantic',  heading: 'Dancing Script',     body: 'Lora' },
  playful:   { name: 'Playful',   heading: 'Pacifico',           body: 'Nunito' },
  handwritten: { name: 'Handwritten', heading: 'Caveat',         body: 'Work Sans' }
};

// Font families bundled with the app (app/fonts). Keep in sync with app/fonts/fonts.css.
export const FONTS = ['Abril Fatface', 'Archivo Black', 'Bebas Neue', 'Bodoni Moda', 'Caveat', 'Cormorant Garamond', 'Crimson Pro',
  'Dancing Script', 'DM Serif Display', 'EB Garamond', 'Fraunces', 'Great Vibes', 'Inter', 'Josefin Sans', 'Libre Baskerville', 'Lora',
  'Montserrat', 'Nunito', 'Oswald', 'Pacifico', 'Playfair Display', 'Raleway', 'Roboto Slab', 'Spectral', 'Work Sans'];

export const STANDARD_COLORS = ['#ffffff', '#f5f0e6', '#e6dcc8', '#c8bba0', '#8a8270', '#4a4740', '#2a2824', '#000000',
  '#7a2e2e', '#c0392b', '#d9822b', '#c9a046', '#5b7a4a', '#2f5d57', '#2563a6', '#2c4a6e', '#5a3e6b', '#b5677d'];

export function defaultTheme(schemeId = 'ivory', fontSchemeId = 'classic') {
  const cs = COLOR_SCHEMES[schemeId] || COLOR_SCHEMES.ivory;
  const fs = FONT_SCHEMES[fontSchemeId] || FONT_SCHEMES.classic;
  return { schemeId, colors: { ...cs.colors }, fontSchemeId, fonts: { heading: fs.heading, body: fs.body } };
}

/** Resolve a model colour ('#hex', 'transparent', '@accent', rgba(...)) to CSS. */
export function resolveColor(doc, v) {
  if (!v || v === 'none' || v === 'transparent') return 'transparent';
  if (v[0] === '@') return (doc && doc.theme && doc.theme.colors[v.slice(1)]) || '#000000';
  return v;
}

/** Resolve a model font ('@heading', '@body' or a family name) to a CSS font-family list. */
export function resolveFont(doc, v) {
  const fonts = (doc && doc.theme && doc.theme.fonts) || FONT_SCHEMES.classic;
  const fam = v === '@heading' ? fonts.heading : v === '@body' || !v ? fonts.body : v;
  return fam === 'Inter' ? '"Inter", system-ui, sans-serif' : `"${fam}", Georgia, serif`;
}

export function fontFamilyName(doc, v) {
  const fonts = (doc && doc.theme && doc.theme.fonts) || FONT_SCHEMES.classic;
  return v === '@heading' ? fonts.heading : v === '@body' || !v ? fonts.body : v;
}

/** Hex colour + opacity -> rgba() */
export function withAlpha(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(color || '');
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Fill -> CSS background value ('transparent' for none). */
export function fillToCSS(doc, fill) {
  if (!fill || fill.type === 'none') return 'transparent';
  const c1 = resolveColor(doc, fill.color);
  if (fill.type === 'solid') return c1;
  const c2 = resolveColor(doc, fill.color2 || '@paper');
  if (fill.type === 'linear') return `linear-gradient(${fill.angle ?? 180}deg, ${c1}, ${c2})`;
  if (fill.type === 'radial') return `radial-gradient(circle at center, ${c1}, ${c2})`;
  return 'transparent';
}

/** Stroke dash -> SVG stroke-dasharray for a given width. */
export function dashArray(dash, width) {
  const w = Math.max(1, width || 1);
  switch (dash) {
    case 'dash': return `${w * 4} ${w * 2.5}`;
    case 'dot': return `${w * 0.01} ${w * 2}`;
    case 'dashDot': return `${w * 4} ${w * 2} ${w * 0.01} ${w * 2}`;
    case 'longDash': return `${w * 8} ${w * 3}`;
    default: return '';
  }
}

/** Shadow -> CSS filter drop-shadow() ('' when disabled). */
export function shadowToCSS(doc, shadow) {
  if (!shadow || !shadow.enabled) return '';
  const c = withAlpha(resolveColor(doc, shadow.color || '#000000'), shadow.opacity ?? 0.3);
  return `drop-shadow(${shadow.x || 0}px ${shadow.y || 0}px ${shadow.blur || 0}px ${c})`;
}
