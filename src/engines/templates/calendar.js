// Calendar generator: month grids as real table elements, month pages and year-at-a-glance layouts.
//
//   computeMonthGrid(year, month, weekStart) -> { weeks: (number|null)[][], … }   pure
//   buildMonthTable(doc, opts) -> table element
//   buildMonthCalendarPage(doc, page, opts) -> Element[] (added to page.elements)
//   buildYearCalendar(doc, opts) -> Element[] (12 month tables + labels added to a page)
//   buildWallCalendar(doc, opts) -> Page[] (one page per month)

import { createPage } from '../../core/model.js';
import { text, table, picture, hline, p, span, esc, r2, splitSizes } from './kit.js';

/**
 * Days in a month (month 0-11).
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Pure month grid. Weeks are arrays of 7 day numbers (null = blank) starting on `weekStart`
 * (0 = Sunday, 1 = Monday). The number of weeks is the natural count (4–6).
 * @param {number} year full year, e.g. 2028
 * @param {number} month 0-11
 * @param {0|1} [weekStart]
 * @returns {{ year: number, month: number, weekStart: number, daysInMonth: number, firstWeekday: number,
 *   leading: number, trailing: number, weeks: Array<Array<number|null>>, weekdayOrder: number[] }}
 */
export function computeMonthGrid(year, month, weekStart = 0) {
  const y = Math.trunc(Number(year)), m = Math.trunc(Number(month));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) throw new RangeError('Invalid year or month');
  const ws = weekStart === 1 ? 1 : 0;
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = daysInMonth(y, m);
  const leading = (first - ws + 7) % 7;
  const cells = Array(leading).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
  return { year: y, month: m, weekStart: ws, daysInMonth: days, firstWeekday: first, leading, trailing, weeks, weekdayOrder };
}

/**
 * Localised weekday names in display order.
 * @param {string} [locale]
 * @param {0|1} [weekStart]
 * @param {'narrow'|'short'|'long'} [format]
 * @returns {string[]}
 */
export function weekdayNames(locale = 'en-US', weekStart = 0, format = 'short') {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: format, timeZone: 'UTC' });
  // 2023-01-01 was a Sunday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + ((i + weekStart) % 7)))));
}

/**
 * Localised month name.
 * @param {number} month 0-11
 * @param {string} [locale]
 * @param {'long'|'short'} [format]
 * @returns {string}
 */
export function monthName(month, locale = 'en-US', format = 'long') {
  return new Intl.DateTimeFormat(locale, { month: format, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, month, 1)));
}

/**
 * Build a month calendar as a table element: a header row of weekday names followed by week rows
 * with day numbers (blank cells before the 1st and after the last day). At least `minWeeks` week
 * rows are produced (default 5) so months line up; extra rows are blank.
 * @param {object} doc the document (tables carry no stories; kept for API symmetry)
 * @param {object} opts { year, month (0-11), weekStart: 0|1, x, y, w, h, locale, minWeeks, headerHeight,
 *   weekdayFormat: 'narrow'|'short'|'long', compact (bool; auto when rows are short), dayAlign, dayValign,
 *   weekendFill (colour|null), blankFill (colour|null), headerFill, headerColor, name }
 * @returns {object} table element
 */
export function buildMonthTable(doc, opts = {}) {
  const now = new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth();
  const weekStart = opts.weekStart === 1 ? 1 : 0;
  const locale = opts.locale || 'en-US';
  const x = opts.x ?? 0, y = opts.y ?? 0, w = opts.w ?? 672, h = opts.h ?? 480;
  const grid = computeMonthGrid(year, month, weekStart);
  const weeks = grid.weeks.slice();
  while (weeks.length < (opts.minWeeks ?? 5)) weeks.push(Array(7).fill(null));
  const headerHeight = opts.headerHeight ?? Math.max(10, Math.min(30, h * 0.09));
  const weekHeights = splitSizes(h - headerHeight, weeks.length);
  const compact = opts.compact ?? weekHeights[0] < 32;
  const baseSize = opts.size ?? (compact ? Math.max(5.5, Math.min(9, weekHeights[0] * 0.42)) : Math.max(9, Math.min(16, weekHeights[0] * 0.16)));
  const headerSize = opts.headerSize ?? (compact ? baseSize : Math.max(7, Math.min(11, headerHeight * 0.42)));
  const names = weekdayNames(locale, weekStart, opts.weekdayFormat || (compact ? 'narrow' : 'short'));
  const headerFill = opts.headerFill === undefined ? '@accent' : opts.headerFill;
  const headerColor = opts.headerColor || (headerFill ? 'paper' : 'accent');
  const blankFill = opts.blankFill === undefined ? (compact ? null : '@light') : opts.blankFill;
  const weekendFill = opts.weekendFill ?? null;
  const pad = compact ? 1 : 6;
  const header = names.map((n) => ({
    html: p(span(esc(compact ? n : n.toUpperCase()), `color: var(--folio-${headerColor}); font-size: ${r2(headerSize)}pt; letter-spacing: ${compact ? 0 : 1}px`)),
    fill: headerFill, align: 'center', valign: 'middle', padding: compact ? 0 : 2
  }));
  const body = weeks.map((wk) => wk.map((d, ci) => {
    const weekday = grid.weekdayOrder[ci];
    const isWeekend = weekday === 0 || weekday === 6;
    return {
      html: d === null ? '<p><br></p>' : p(isWeekend && !compact ? span(String(d), 'color: var(--folio-accent)') : String(d)),
      fill: d === null ? blankFill : (isWeekend ? weekendFill : null),
      align: opts.dayAlign || (compact ? 'center' : 'right'),
      valign: opts.dayValign || (compact ? 'middle' : 'top'),
      padding: pad
    };
  }));
  const el = table(x, y, w, h, [header, ...body], {
    name: opts.name || `${monthName(month, locale)} ${year}`,
    rowHeights: [r2(headerHeight), ...weekHeights],
    header: true,
    border: opts.border || { color: compact ? '@light' : '@muted', width: compact ? 0 : 0.75, dash: 'solid' },
    style: { font: '@body', size: r2(baseSize), color: '@ink', ...(opts.style || {}) }
  });
  el.calendar = { year, month, weekStart, locale };
  return el;
}

function pageArea(doc, opts) {
  const m = doc.setup.margins;
  return {
    x: opts.x ?? m.left, y: opts.y ?? m.top,
    w: opts.w ?? doc.setup.width - m.left - m.right, h: opts.h ?? doc.setup.height - m.top - m.bottom
  };
}

/**
 * Lay out one month on a page: optional picture placeholder, month title and year, and the month table.
 * Elements are appended to page.elements and returned.
 * @param {object} doc
 * @param {object} page
 * @param {object} opts { year, month, weekStart, locale, picture (bool, default true), x, y, w, h (area; default page margins),
 *   pictureRatio (0..1 of the area height, default 0.42) }
 * @returns {object[]}
 */
export function buildMonthCalendarPage(doc, page, opts = {}) {
  const now = new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth();
  const locale = opts.locale || 'en-US';
  const a = pageArea(doc, opts);
  const els = [];
  let top = a.y;
  if (opts.picture !== false) {
    const ph = r2(a.h * (opts.pictureRatio ?? 0.42));
    els.push(picture(a.x, top, a.w, ph, { name: `${monthName(month, locale)} picture` }));
    top += ph + 18;
  }
  const titleH = 58;
  els.push(text(doc, a.x, top, a.w * 0.68, titleH, p(esc(monthName(month, locale))),
    { font: '@heading', size: 40, color: '@accent', lineHeight: 1 }, { name: 'Month', valign: 'bottom' }));
  els.push(text(doc, a.x + a.w * 0.68, top, a.w * 0.32, titleH, p(String(year)),
    { font: '@heading', size: 22, color: '@muted', align: 'right', lineHeight: 1, letterSpacing: 2 }, { name: 'Year', valign: 'bottom' }));
  top += titleH + 8;
  els.push(hline(a.x, top, a.w, '@accent2', 1.5, { name: 'Title rule' }));
  top += 12;
  els.push(buildMonthTable(doc, { ...opts, year, month, locale, x: a.x, y: top, w: a.w, h: a.y + a.h - top }));
  page.elements.push(...els);
  return els;
}

/**
 * One-page year at a glance: 12 compact month tables with month labels in a grid.
 * @param {object} doc
 * @param {object} opts { year, weekStart, locale, page (default doc.pages[0]), x, y, w, h (area), cols (default 3 portrait / 4 landscape),
 *   gap (px) }
 * @returns {object[]} elements appended to the page
 */
export function buildYearCalendar(doc, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const locale = opts.locale || 'en-US';
  const page = opts.page || doc.pages[0];
  const a = pageArea(doc, opts);
  const cols = opts.cols ?? (a.w > a.h ? 4 : 3);
  const rows = Math.ceil(12 / cols);
  const gapX = opts.gapX ?? opts.gap ?? 22, gapY = opts.gapY ?? opts.gap ?? 18;
  const cw = (a.w - gapX * (cols - 1)) / cols;
  const ch = (a.h - gapY * (rows - 1)) / rows;
  const labelH = Math.min(26, ch * 0.16);
  const els = [];
  for (let m = 0; m < 12; m++) {
    const cx = a.x + (m % cols) * (cw + gapX);
    const cy = a.y + Math.floor(m / cols) * (ch + gapY);
    els.push(text(doc, cx, cy, cw, labelH, p(esc(monthName(m, locale))),
      { font: '@heading', size: r2(Math.max(9, Math.min(15, labelH * 0.55))), color: '@accent', lineHeight: 1 },
      { name: `${monthName(m, locale)} label`, valign: 'middle' }));
    els.push(buildMonthTable(doc, {
      year, month: m, weekStart: opts.weekStart, locale, x: cx, y: cy + labelH + 2, w: cw, h: ch - labelH - 2,
      compact: true, minWeeks: 6, headerFill: null, headerColor: 'muted', headerHeight: r2((ch - labelH - 2) / 7)
    }));
  }
  page.elements.push(...els);
  return els;
}

/**
 * Twelve month pages (January–December) appended to `doc` (each with buildMonthCalendarPage).
 * @param {object} doc
 * @param {object} opts { year, weekStart, locale, picture, pictureRatio }
 * @returns {object[]} the new pages
 */
export function buildWallCalendar(doc, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const pages = [];
  for (let m = 0; m < 12; m++) {
    const page = createPage(doc);
    doc.pages.push(page);
    buildMonthCalendarPage(doc, page, { ...opts, year, month: m });
    pages.push(page);
  }
  return pages;
}
