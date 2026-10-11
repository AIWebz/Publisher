// Templates: menus, catalogs and price lists.

import { newDoc, text, rect, outline, hline, picture, table, setPages, p, span, field, solidBg, css } from './kit.js';
import { logoMark, ornamentDivider } from './parts.js';

const dotted = (color = '@muted') => ({ top: null, left: null, right: null, bottom: { color, width: 0.75, dash: 'dot' } });

// ---------------------------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------------------------

function restaurantMenu() {
  const doc = newDoc({ title: 'The Linden Table Menu', size: 'menuTall', schemeId: 'ivory', fontSchemeId: 'editorial', margins: 72, category: 'menus' });
  const els = [];
  const section = (y, title, items) => {
    els.push(text(doc, 72, y - 2, 672, 36, p(title), { font: '@heading', size: 20, color: '@accent', align: 'center', caps: true, letterSpacing: 4 }, { name: `${title} heading` }));
    items.forEach(([name, desc, price], i) => {
      const iy = y + 46 + i * 64;
      els.push(text(doc, 72, iy, 548, 56, p(`<b>${name}</b>`) + p(span(desc, `${css.muted}; font-style: italic; font-size: 10.5pt`)),
        { size: 12.5, lineHeight: 1.35 }, { name }));
      els.push(text(doc, 644, iy, 100, 22, p(price), { size: 12.5, align: 'right', bold: true, color: '@accent' }, { name: `${name} price` }));
    });
  };
  els.push(
    outline(28, 28, 760, 1288, '@accent2', 1, { name: 'Border' }),
    text(doc, 72, 70, 672, 22, p('Seasonal kitchen · Est. 1998'), { size: 10, caps: true, letterSpacing: 4, color: '@accent2', align: 'center' }, { name: 'Tagline' }),
    text(doc, 72, 98, 672, 80, p('The Linden Table'), { font: '@heading', size: 48, align: 'center' }, { name: 'Restaurant name', valign: 'middle' }),
    ...ornamentDivider(318, 194, 180),
    text(doc, 72, 212, 672, 24, p('Dinner · Tuesday to Sunday from half past five'), { italic: true, size: 12, color: '@muted', align: 'center' }, { name: 'Service times' })
  );
  section(268, 'Starters', [
    ['Roasted beetroot &amp; goat’s curd', 'Candied walnuts, blood orange, chervil', '$13'],
    ['Smoked trout rillettes', 'Pickled cucumber, rye crisps, dill crème fraîche', '$15'],
    ['Wild mushroom soup', 'Thyme, brown butter croutons', '$11'],
    ['Burrata', 'Heirloom tomatoes, basil oil, grilled sourdough', '$16']
  ]);
  section(596, 'Mains', [
    ['Pan-roasted hake', 'Crushed potatoes, mussels, saffron and fennel broth', '$29'],
    ['Slow-braised short rib', 'Celeriac purée, glazed carrots, red wine jus', '$34'],
    ['Squash &amp; sage risotto', 'Aged parmesan, toasted pumpkin seeds', '$24'],
    ['Herb-crusted lamb rump', 'Flageolet beans, salsa verde, charred leeks', '$36'],
    ['Linden burger', 'Dry-aged beef, smoked cheddar, onion jam, hand-cut fries', '$22']
  ]);
  section(988, 'Desserts', [
    ['Dark chocolate delice', 'Salted caramel, crème fraîche sorbet', '$12'],
    ['Poached pear tart', 'Almond frangipane, vanilla ice cream', '$11'],
    ['Cheese board', 'Three local cheeses, quince paste, oat biscuits', '$16']
  ]);
  els.push(text(doc, 72, 1250, 672, 36, p('Please tell your server about any allergies or dietary requirements.<br>A discretionary service charge of 12.5% is added to tables of six or more.'),
    { size: 9, color: '@muted', align: 'center', lineHeight: 1.5 }, { name: 'Footer' }));
  return setPages(doc, [[els]]);
}

function cafeMenuBoard() {
  const doc = newDoc({ title: 'Harbour Coffee House Menu Board', size: 'tabloid', orientation: 'landscape', schemeId: 'lagoon', fontSchemeId: 'display', margins: 72, category: 'menus' });
  const colX = [72, 588, 1104], W = 456;
  const board = (i, title, rows) => [
    text(doc, colX[i], 232, W, 54, p(title), { font: '@heading', size: 30, color: '@accent2' }, { name: `${title} heading` }),
    hline(colX[i], 290, W, '@accent2', 1.5, { name: `${title} rule` }),
    table(colX[i], 306, W, rows.length * 58, rows.map(([a, b]) => [a, b]), {
      colWeights: [4, 1], name: `${title} prices`, border: { color: '@muted', width: 0 }, style: { size: 17, color: '@paper', font: '@body' },
      cellProps: (r, c) => ({ align: c === 1 ? 'right' : 'left', padding: 6, borders: dotted('@muted') })
    })
  ];
  return setPages(doc, [[[
    text(doc, 72, 56, 1488, 104, p('Harbour Coffee House'), { font: '@heading', size: 62, color: '@paper', align: 'center' }, { name: 'Name', valign: 'middle' }),
    text(doc, 72, 160, 1488, 28, p('Roasted on the quay · Baked every morning'), { size: 13, caps: true, letterSpacing: 6, color: '@accent2', align: 'center' }, { name: 'Tagline' }),
    ...board(0, 'Coffee', [['Espresso', '2.80'], ['Macchiato', '3.10'], ['Flat white', '3.60'], ['Cappuccino', '3.70'], ['Latte', '3.80'], ['Mocha', '4.20'], ['Filter of the day', '3.20'], ['Cold brew', '4.00']]),
    ...board(1, 'Tea &amp; more', [['English breakfast', '2.90'], ['Earl grey', '2.90'], ['Fresh mint', '3.00'], ['Chai latte', '3.80'], ['Matcha latte', '4.20'], ['Hot chocolate', '3.90'], ['Fresh orange juice', '3.60'], ['Sparkling lemonade', '3.20']]),
    ...board(2, 'From the bakery', [['Butter croissant', '3.20'], ['Pain au chocolat', '3.50'], ['Cardamom bun', '3.60'], ['Almond financier', '2.80'], ['Banana bread', '3.40'], ['Cheese scone', '3.30'], ['Soup &amp; sourdough', '7.50'], ['Toasted sandwich', '8.50']]),
    hline(72, 828 + 50, 1488, '@muted', 0.75, { name: 'Footer rule' }),
    text(doc, 72, 896, 1488, 70, p('Oat, almond and soy milk at no extra charge · Ask about today’s cake') + p(span('Open daily 7 am – 6 pm · harbourcoffee.example', css.accent2)),
      { size: 15, color: '@paper', align: 'center', lineHeight: 1.6 }, { name: 'Footer' })
  ], { background: solidBg('@ink') }]]);
}

// ---------------------------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------------------------

const PRODUCTS = [
  [['Tidewater dinner plate', 'Speckled stoneware, 27 cm. Dishwasher safe.', '$34'], ['Tidewater side plate', 'Matching 20 cm plate in sea-salt glaze.', '$26'], ['Harbour pasta bowl', 'Wide rim, generous 22 cm bowl.', '$30'],
    ['Morning mug', 'Thumb-rest handle, holds 350 ml.', '$22'], ['Pour-over set', 'Dripper and carafe in iron-oxide glaze.', '$68'], ['Salt cellar', 'Lidded pot with a beechwood spoon.', '$24']],
  [['Fieldstone bud vase', 'Hand-thrown, 14 cm, holds a single stem.', '$28'], ['Moonjar vase', 'Rounded 30 cm vase in milky white.', '$120'], ['Ridge planter', 'Carved ridges, drainage hole and saucer.', '$45'],
    ['Hanging planter', 'With waxed cotton cord, 15 cm.', '$38'], ['Tealight trio', 'Three pierced holders with a warm glow.', '$32'], ['Incense dish', 'Ash-catching dish with a stone holder.', '$18']]
];

function productGrid(doc, products) {
  const els = [];
  const colX = [56, 300, 544], rowY = [140, 512];
  products.forEach(([name, desc, price], i) => {
    const x = colX[i % 3], y = rowY[Math.floor(i / 3)];
    els.push(
      picture(x, y, 216, 216, { name: `${name} photo` }),
      text(doc, x, y + 228, 216, 24, p(name), { font: '@heading', size: 13.5 }, { name: `${name} name` }),
      text(doc, x, y + 254, 216, 40, p(desc), { size: 9.5, color: '@muted', lineHeight: 1.4 }, { name: `${name} description` }),
      text(doc, x, y + 298, 216, 22, p(price), { size: 12, bold: true, color: '@accent' }, { name: `${name} price` })
    );
  });
  return els;
}

function productCatalog() {
  const doc = newDoc({ title: 'Fieldstone Ceramics Catalog', size: 'letter', schemeId: 'midnight', fontSchemeId: 'editorial', margins: 56, category: 'catalogs' });
  doc.masters[0].elements.push(
    hline(56, 1000, 704, '@muted', 0.5, { name: 'Footer rule' }),
    text(doc, 56, 1010, 500, 16, p('Fieldstone Ceramics · Autumn / Winter 2026'), { size: 8.5, caps: true, letterSpacing: 2, color: '@muted' }, { name: 'Running footer' }),
    text(doc, 560, 1010, 200, 16, p(field('#page')), { size: 9, align: 'right', color: '@muted' }, { name: 'Page number' })
  );
  const pageHead = (kick, title) => [
    text(doc, 56, 56, 704, 18, p(kick), { size: 9, caps: true, letterSpacing: 3, color: '@accent2' }, { name: 'Kicker' }),
    text(doc, 56, 72, 704, 48, p(title), { font: '@heading', size: 28 }, { name: 'Page title' }),
    hline(56, 122, 704, '@ink', 0.75, { name: 'Title rule' })
  ];
  return setPages(doc, [
    [[
      picture(0, 0, 816, 680, { name: 'Cover photo' }),
      text(doc, 56, 716, 704, 20, p('Autumn / Winter Collection 2026'), { size: 11, caps: true, letterSpacing: 4, color: '@accent2' }, { name: 'Season' }),
      text(doc, 56, 744, 600, 80, p('Fieldstone Ceramics'), { font: '@heading', size: 48 }, { name: 'Brand' }),
      text(doc, 56, 840, 520, 110, p('Tableware, vases and small comforts, thrown and glazed by hand in our Vermont studio. Every piece is a little different — that is rather the point.'),
        { size: 13, lineHeight: 1.55, color: '@muted' }, { name: 'Introduction' }),
      ...logoMark(doc, 660, 856, 100, 'FC')
    ], { masterId: null }],
    [[...pageHead('Collection', 'Tableware'), ...productGrid(doc, PRODUCTS[0]),
      rect(56, 868, 704, 104, '@light', { name: 'Note panel' }),
      text(doc, 80, 868, 656, 104, p(span('Made to be used', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 4px') +
        p('All tableware is fired to stoneware temperatures, lead-free and safe for the dishwasher, microwave and oven.'), { size: 10.5, lineHeight: 1.5 }, { name: 'Note', valign: 'middle' })]],
    [[...pageHead('Collection', 'Vases &amp; planters'), ...productGrid(doc, PRODUCTS[1]),
      rect(56, 868, 704, 104, '@light', { name: 'Note panel' }),
      text(doc, 80, 868, 656, 104, p(span('Care &amp; guarantee', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 4px') +
        p('Planters are glazed inside so they will not seep. If anything arrives damaged, send us a photo within 14 days and we will replace it.'), { size: 10.5, lineHeight: 1.5 }, { name: 'Note', valign: 'middle' })]],
    [[...pageHead('Ordering', 'How to order'),
      text(doc, 56, 140, 704, 90, p('Order online at fieldstone.example, by phone on (555) 014 9031, or visit the studio shop, open Thursday to Sunday, 10 am – 5 pm. Orders over $100 ship free within the continental US.'),
        { size: 11, lineHeight: 1.55 }, { name: 'Ordering text' }),
      table(56, 248, 704, 360, [
        ['<b>Code</b>', '<b>Product</b>', '<b>Colours</b>', '<b>Price</b>'],
        ['TW-01', 'Tidewater dinner plate', 'Sea salt, slate', '$34'], ['TW-02', 'Tidewater side plate', 'Sea salt, slate', '$26'], ['HB-01', 'Harbour pasta bowl', 'Sea salt, rust', '$30'],
        ['MM-01', 'Morning mug', 'Six glazes', '$22'], ['PO-01', 'Pour-over set', 'Iron oxide', '$68'], ['FV-01', 'Fieldstone bud vase', 'Moss, bone', '$28'],
        ['MJ-01', 'Moonjar vase', 'Milk white', '$120'], ['RP-01', 'Ridge planter', 'Bone, charcoal', '$45']
      ], { colWeights: [1, 3, 2, 1], header: true, banded: true, headerFill: '@accent', headerColor: 'paper', name: 'Order table', style: { size: 10.5 },
        cellProps: (r, c) => ({ align: c === 3 ? 'right' : 'left', padding: 6 }) }),
      rect(56, 640, 704, 200, '@accent', { name: 'Studio panel' }),
      text(doc, 88, 664, 400, 152, p(span('Visit the studio', `${css.heading}; font-size: 20pt`), 'margin-bottom: 6px') +
        p('Watch us throw, glaze and fire, and find seconds at half price in the barn. 48 Mill Brook Road, Dorset, Vermont.'), { size: 11, lineHeight: 1.55, color: '@paper' }, { name: 'Studio text', valign: 'middle' }),
      picture(520, 664, 216, 152, { name: 'Studio photo' }),
      text(doc, 56, 872, 704, 100, p(span('Wholesale &amp; gifts', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 4px') +
        p('Shops and restaurants can order from our trade list with a minimum of twelve pieces per design. Gift cards are available in any amount and never expire.'),
      { size: 10.5, lineHeight: 1.5 }, { name: 'Wholesale' })
    ]]
  ]);
}

function productSheet() {
  const doc = newDoc({ title: 'Aero Standing Desk Product Sheet', size: 'letter', schemeId: 'harbor', fontSchemeId: 'modern', margins: 56, category: 'catalogs' });
  return setPages(doc, [[[
    rect(0, 0, 816, 8, '@accent', { name: 'Top rule' }),
    text(doc, 56, 48, 400, 18, p('Northwind Furniture · Workspace'), { size: 9, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
    text(doc, 56, 70, 360, 118, p('Aero Standing Desk'), { font: '@heading', size: 40, lineHeight: 1.05 }, { name: 'Product name' }),
    text(doc, 56, 196, 360, 120, p('A whisper-quiet electric desk that moves from sitting to standing in under twenty seconds. Solid oak top, steel frame and a ten-year warranty.'),
      { size: 12.5, lineHeight: 1.55, color: '@muted' }, { name: 'Summary' }),
    rect(56, 330, 200, 64, '@accent', { name: 'Price panel' }),
    text(doc, 56, 330, 200, 64, p(span('From', 'font-size: 9pt; text-transform: uppercase; letter-spacing: 2px')) + p(span('$849', `${css.heading}; font-size: 24pt`)),
      { size: 12, color: '@paper', align: 'center', lineHeight: 1.1 }, { name: 'Price', valign: 'middle' }),
    picture(440, 48, 320, 360, { name: 'Product photo' }),
    text(doc, 56, 440, 330, 28, p('Features'), { font: '@heading', size: 18, color: '@accent' }, { name: 'Features heading' }),
    text(doc, 56, 476, 330, 300, '<ul><li>Dual motors lift 150 kg smoothly and quietly</li><li>Four memory presets on a soft-touch keypad</li>' +
      '<li>Anti-collision sensor stops the desk if it meets resistance</li><li>Integrated cable tray and grommets</li>' +
      '<li>FSC-certified solid oak or walnut top, oiled by hand</li><li>Assembles in under thirty minutes</li></ul>',
    { size: 11, lineHeight: 1.55, spaceAfter: 4 }, { name: 'Features' }),
    text(doc, 430, 440, 330, 28, p('Specifications'), { font: '@heading', size: 18, color: '@accent' }, { name: 'Specs heading' }),
    table(430, 476, 330, 336, [
      ['Height range', '62 – 127 cm'], ['Top sizes', '140 × 70 or 160 × 80 cm'], ['Lifting speed', '38 mm per second'], ['Load capacity', '150 kg'],
      ['Noise level', 'Under 45 dB'], ['Frame finishes', 'Black, white, graphite'], ['Power', '100–240 V, 0.1 W standby'], ['Warranty', '10 years frame, 5 years motors']
    ], { colWeights: [1.1, 1.6], banded: true, name: 'Specifications table', border: { color: '@light', width: 0.75 }, style: { size: 10 },
      cellProps: (r, c) => ({ padding: 6, fill: c === 0 ? '@light' : null }) }),
    hline(56, 860, 704, '@ink', 0.75, { name: 'Footer rule' }),
    text(doc, 56, 876, 460, 80, p('<b>Northwind Furniture</b><br>Showroom: 77 Canal Street, Portland, OR<br>sales@northwind.example · (555) 014 4470'),
      { size: 10, lineHeight: 1.55, color: '@muted' }, { name: 'Contact' }),
    ...logoMark(doc, 680, 876, 80, 'NW')
  ]]]);
}

// ---------------------------------------------------------------------------------------------
// Price lists
// ---------------------------------------------------------------------------------------------

function printPriceList() {
  const doc = newDoc({ title: 'Harbor Print Co. Price List', size: 'letter', schemeId: 'midnight', fontSchemeId: 'modern', margins: 56, category: 'priceLists' });
  const rows = [
    ['Business cards', '3.5 × 2 in', '$29', '$45', '$62', '$89'], ['Flyers', '5.5 × 8.5 in', '$39', '$62', '$88', '$135'], ['Flyers', '8.5 × 11 in', '$55', '$89', '$129', '$198'],
    ['Postcards', '6 × 4 in', '$42', '$68', '$95', '$149'], ['Tri-fold brochures', '11 × 8.5 in', '$95', '$165', '$245', '$389'], ['Booklets, 8 pages', '5.5 × 8.5 in', '$180', '$310', '$480', '$790'],
    ['Posters', '11 × 17 in', '$85', '$150', '$230', '$370'], ['Letterheads', '8.5 × 11 in', '$48', '$79', '$112', '$175'], ['Envelopes #10', '9.5 × 4.125 in', '$52', '$88', '$128', '$199'],
    ['Address labels', '30 per sheet', '$24', '$40', '$58', '$92'], ['Greeting cards', '5 × 7 in folded', '$68', '$118', '$176', '$279'], ['Stickers', '3 in round', '$35', '$58', '$84', '$128']
  ];
  return setPages(doc, [[[
    rect(0, 0, 816, 200, '@accent', { name: 'Header band' }),
    text(doc, 56, 52, 500, 20, p('Harbor Print Co.'), { size: 11, caps: true, letterSpacing: 4, color: '@accent2' }, { name: 'Company' }),
    text(doc, 56, 74, 560, 76, p('Price List 2026'), { font: '@heading', size: 44, color: '@paper' }, { name: 'Title' }),
    text(doc, 56, 152, 560, 24, p('Full-colour digital printing on 350 gsm silk unless noted. Prices per order, tax excluded.'), { size: 10.5, color: '@paper' }, { name: 'Subtitle' }),
    ...logoMark(doc, 664, 52, 96, 'HP', '@accent2', '@accent'),
    table(56, 236, 704, 520, [['<b>Product</b>', '<b>Size</b>', '<b>100</b>', '<b>250</b>', '<b>500</b>', '<b>1,000</b>'], ...rows], {
      colWeights: [2.6, 2, 1, 1, 1, 1], header: true, banded: true, headerFill: '@accent', headerColor: 'paper', name: 'Price table',
      border: { color: '@light', width: 0.75 }, style: { size: 10.5 }, cellProps: (r, c) => ({ align: c >= 2 ? 'right' : 'left', padding: 6 })
    }),
    text(doc, 56, 780, 340, 150, p(span('Good to know', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 6px') +
      '<ul><li>Standard turnaround is three working days</li><li>Next-day service: add 30%</li><li>Free proof with every order</li><li>Recycled stock at no extra charge</li></ul>',
    { size: 10, lineHeight: 1.5 }, { name: 'Notes' }),
    rect(420, 780, 340, 150, '@light', { name: 'Contact panel' }),
    text(doc, 444, 780, 292, 150, p(span('Get a quote', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 6px') +
      p('Larger runs, special papers and finishes quoted on request.') + p('<b>(555) 014 3300</b><br>orders@harborprint.example', 'margin-top: 6px'),
    { size: 10, lineHeight: 1.5 }, { name: 'Contact', valign: 'middle' }),
    text(doc, 56, 960, 704, 32, p('Harbor Print Co. · 9 Wharf Street, Salem, MA · Prices valid until 31 December 2026'), { size: 9, color: '@muted', align: 'center' }, { name: 'Footer' })
  ]]]);
}

function servicePriceList() {
  const doc = newDoc({ title: 'Willow & Thread Salon Services', size: 'letter', schemeId: 'rosewood', fontSchemeId: 'display', margins: 64, category: 'priceLists' });
  const els = [];
  const section = (x, y, title, rows) => {
    els.push(text(doc, x, y, 320, 34, p(title), { font: '@heading', size: 21, color: '@accent' }, { name: `${title} heading` }));
    els.push(hline(x, y + 40, 320, '@accent2', 1, { name: `${title} rule` }));
    els.push(table(x, y + 50, 320, rows.length * 46, rows.map(([s, d, pr]) => [`${s}<br><span style="color: var(--folio-muted); font-size: 8.5pt">${d}</span>`, pr]), {
      colWeights: [4, 1], name: `${title} prices`, border: { color: '@muted', width: 0 }, style: { size: 11 },
      cellProps: (r, c) => ({ align: c === 1 ? 'right' : 'left', valign: c === 1 ? 'top' : 'middle', padding: 4, borders: dotted('@accent2') })
    }));
  };
  els.push(
    text(doc, 64, 64, 688, 20, p('Hair · Colour · Care'), { size: 10, caps: true, letterSpacing: 5, color: '@accent2', align: 'center' }, { name: 'Tagline' }),
    text(doc, 64, 86, 688, 82, p('Willow &amp; Thread'), { font: '@heading', size: 46, align: 'center' }, { name: 'Salon name', valign: 'middle' }),
    ...ornamentDivider(318, 176, 180, '@accent'),
    text(doc, 64, 194, 688, 24, p('Services &amp; prices'), { italic: true, size: 13, color: '@muted', align: 'center' }, { name: 'Subtitle' })
  );
  section(64, 250, 'Cutting &amp; styling', [['Signature cut', '60 minutes, includes wash and finish', '$68'], ['Restyle', '75 minutes, consultation included', '$85'],
    ['Fringe trim', '15 minutes', '$15'], ['Blow-dry', '45 minutes', '$42'], ['Children’s cut', 'Under 12, 30 minutes', '$28']]);
  section(432, 250, 'Colour', [['Full head colour', '90 minutes', '$95'], ['Root touch-up', '60 minutes', '$70'], ['Balayage', 'From 2.5 hours', '$165'],
    ['Gloss &amp; tone', '30 minutes', '$40'], ['Highlights, half head', '2 hours', '$120']]);
  section(64, 590, 'Treatments', [['Deep-conditioning ritual', '30 minutes', '$35'], ['Scalp therapy', '45 minutes', '$48'], ['Keratin smoothing', '2.5 hours', '$210']]);
  section(432, 590, 'Occasions', [['Bridal trial', '90 minutes', '$95'], ['Wedding morning', 'Per person, on location', '$130'], ['Up-do', '60 minutes', '$75']]);
  els.push(
    rect(64, 850, 688, 110, '@light', { name: 'Booking panel' }),
    text(doc, 88, 850, 640, 110, p(span('Book your visit', `${css.heading}; font-size: 17pt; ${css.accent}`), 'margin-bottom: 4px') +
      p('willowandthread.example · (555) 014 6128 · 22 Chapel Row, Bath') + p('Open Tuesday to Saturday, 9 am – 7 pm. Gift vouchers available.'),
    { size: 10.5, lineHeight: 1.5, align: 'center' }, { name: 'Booking', valign: 'middle' })
  );
  return setPages(doc, [[els]]);
}

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: Function}>} */
export const COMMERCE_TEMPLATES = [
  { id: 'restaurant-menu', name: 'Restaurant Menu', category: 'menus', description: 'Tall dinner menu with starters, mains and desserts and right-aligned prices.', sizeLabel: 'Legal · 8.5 × 14 in', build: restaurantMenu },
  { id: 'cafe-menu-board', name: 'Café Menu Board', category: 'menus', description: 'Landscape menu board with three price tables on a dark background.', sizeLabel: 'Tabloid landscape · 17 × 11 in', build: cafeMenuBoard },
  { id: 'product-catalog', name: 'Product Catalog', category: 'catalogs', description: 'Four-page catalog: cover, two product grids with prices and an order page.', sizeLabel: 'Letter · 4 pages', build: productCatalog },
  { id: 'product-sheet', name: 'Product Sheet', category: 'catalogs', description: 'One-page product sheet with hero photo, features and a specifications table.', sizeLabel: 'Letter · 1 page', build: productSheet },
  { id: 'price-list', name: 'Price List', category: 'priceLists', description: 'Table-based price list with a header row, banded rows and quantity columns.', sizeLabel: 'Letter · 1 page', build: printPriceList },
  { id: 'service-price-list', name: 'Service Price List', category: 'priceLists', description: 'Elegant services menu in four sections with durations and prices.', sizeLabel: 'Letter · 1 page', build: servicePriceList }
];
