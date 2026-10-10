// Measurement units. The document model always stores lengths in CSS pixels at 96 dpi;
// these helpers convert to and from the user's display unit.

export const UNITS = {
  in: { label: 'in', name: 'Inches', perPx: 1 / 96, step: 0.05, digits: 2 },
  cm: { label: 'cm', name: 'Centimetres', perPx: 2.54 / 96, step: 0.1, digits: 2 },
  mm: { label: 'mm', name: 'Millimetres', perPx: 25.4 / 96, step: 1, digits: 1 },
  pt: { label: 'pt', name: 'Points', perPx: 72 / 96, step: 1, digits: 1 },
  pc: { label: 'pc', name: 'Picas', perPx: 6 / 96, step: 0.5, digits: 2 },
  px: { label: 'px', name: 'Pixels', perPx: 1, step: 1, digits: 0 }
};

export const DPI = 96;
export const PT_PER_PX = 72 / 96;

/** px -> unit value */
export function toUnit(px, unit = 'in') {
  const u = UNITS[unit] || UNITS.in;
  return px * u.perPx;
}

/** unit value -> px */
export function fromUnit(value, unit = 'in') {
  const u = UNITS[unit] || UNITS.in;
  return value / u.perPx;
}

/** Round a px length for display in the given unit, e.g. formatUnit(96, 'in') === '1' */
export function formatUnit(px, unit = 'in', withLabel = false) {
  const u = UNITS[unit] || UNITS.in;
  const v = +toUnit(px, unit).toFixed(u.digits);
  return withLabel ? `${v} ${u.label}` : String(v);
}

/**
 * Parse a user-typed length. Accepts a bare number (interpreted in `unit`) or a number with a
 * unit suffix ("2.5in", "10 mm", "12pt", '3"'). Returns px, or NaN if it cannot be parsed.
 */
export function parseLength(text, unit = 'in') {
  const m = String(text).trim().replace(',', '.').match(/^(-?\d*\.?\d+)\s*(in|"|cm|mm|pt|pc|px)?$/i);
  if (!m) return NaN;
  let u = (m[2] || unit).toLowerCase();
  if (u === '"') u = 'in';
  return fromUnit(parseFloat(m[1]), u);
}

export const ptToPx = (pt) => pt / PT_PER_PX;
export const pxToPt = (px) => px * PT_PER_PX;
