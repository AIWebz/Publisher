// Templates: business cards, greeting cards, invitations, postcards and certificates.

import { IN, newDoc, text, rect, shape, outline, hline, vline, picture, setPages, slotGrid, p, span, field, solidBg, css } from './kit.js';
import { logoMark, ornamentDivider } from './parts.js';

const ADDRESS_BLOCK = `${field('Name')}<br>${field('Address')}<br>${field('City')}, ${field('State')} ${field('ZIP')}`;

// ---------------------------------------------------------------------------------------------
// Business cards
// ---------------------------------------------------------------------------------------------

function cardClassic() {
  const doc = newDoc({ title: 'Vance Bindery Business Card', size: 'businessCard', schemeId: 'ivory', fontSchemeId: 'classic', margins: 18, category: 'businessCards' });
  return setPages(doc, [
    [[
      outline(12, 12, 312, 168, '@accent2', 0.75, { name: 'Inner border' }),
      text(doc, 24, 58, 288, 40, p('Eleanor Vance'), { font: '@heading', size: 22, color: '@paper', align: 'center' }, { name: 'Name', valign: 'middle' }),
      hline(138, 106, 60, '@accent2', 1, { ornament: 'diamond', name: 'Ornament' }),
      text(doc, 24, 118, 288, 22, p('Bookbinder &amp; Restorer'), { italic: true, size: 9.5, color: '@accent2', align: 'center' }, { name: 'Title' })
    ], { background: solidBg('@ink') }],
    [[
      text(doc, 24, 24, 220, 26, p('Vance Bindery'), { font: '@heading', size: 15, bold: true }, { name: 'Company' }),
      hline(24, 56, 44, '@accent', 1.25, { name: 'Accent rule' }),
      ...logoMark(doc, 268, 20, 44, 'VB'),
      text(doc, 24, 100, 288, 70, p('eleanor@vancebindery.example<br>+1 (555) 014 2290<br>18 Orchard Lane, Hudson, NY'), { size: 8.5, lineHeight: 1.6, color: '@muted' }, { name: 'Contact details', valign: 'bottom' })
    ]]
  ]);
}

function cardModern() {
  const doc = newDoc({ title: 'Solberg Studio Business Card', size: 'businessCard', schemeId: 'harbor', fontSchemeId: 'modern', margins: 18, category: 'businessCards' });
  const logo = logoMark(doc, 24, 60, 72, 'NS', '@paper', '@accent');
  return setPages(doc, [
    [[
      rect(0, 0, 120, 192, '@accent', { name: 'Accent panel' }),
      ...logo,
      text(doc, 144, 34, 176, 28, p('Nadia Solberg'), { font: '@heading', size: 16 }, { name: 'Name' }),
      text(doc, 144, 64, 176, 16, p('Landscape Architect'), { size: 7.5, caps: true, letterSpacing: 1.5, color: '@accent' }, { name: 'Title' }),
      hline(144, 94, 32, '@accent2', 2, { name: 'Accent rule' }),
      text(doc, 144, 108, 176, 54, p('(555) 014 8820<br>nadia@solbergstudio.example<br>solbergstudio.example'), { size: 8, lineHeight: 1.55, color: '@ink' }, { name: 'Contact details' })
    ]],
    [[
      text(doc, 24, 66, 288, 34, p('Solberg Studio'), { font: '@heading', size: 21, color: '@paper', align: 'center' }, { name: 'Company', valign: 'middle' }),
      text(doc, 24, 104, 288, 18, p('Gardens · Courtyards · Public spaces'), { size: 7.5, caps: true, letterSpacing: 2, color: '@accent2', align: 'center' }, { name: 'Tagline' })
    ], { background: solidBg('@accent') }]
  ]);
}

/** Slot geometry for the 10-up business card sheet (Letter, 2 × 5, 3.5 × 2 in, no gaps). */
export const CARD_SHEET = { cols: 2, rows: 5, x: 0.75 * IN, y: 0.5 * IN, w: 3.5 * IN, h: 2 * IN, gapX: 0, gapY: 0 };

function cardSheet() {
  const doc = newDoc({ title: 'Business Cards Sheet', size: 'letter', schemeId: 'midnight', fontSchemeId: 'editorial', margins: { top: 48, right: 72, bottom: 48, left: 72 }, category: 'businessCards' });
  const { groups, repeat } = slotGrid(CARD_SHEET, (i, x, y) => [
    rect(x, y, 336, 192, '@paper', { name: 'Card background' }),
    rect(x, y, 8, 192, '@accent', { name: 'Accent bar' }),
    text(doc, x + 28, y + 28, 290, 30, p(field('Name')), { font: '@heading', size: 17 }, { name: 'Name' }),
    text(doc, x + 28, y + 60, 290, 18, p(field('Title')), { italic: true, size: 9.5, color: '@accent' }, { name: 'Title' }),
    hline(x + 28, y + 92, 40, '@accent2', 1.25, { name: 'Accent rule' }),
    text(doc, x + 28, y + 106, 290, 60, p(`${field('Email')}<br>${field('Phone')}<br>Northwind Studio · 12 Harbour Row`), { size: 8.5, lineHeight: 1.55, color: '@muted' }, { name: 'Contact details' })
  ]);
  const v = [CARD_SHEET.x, CARD_SHEET.x + CARD_SHEET.w, CARD_SHEET.x + 2 * CARD_SHEET.w];
  const h = Array.from({ length: 6 }, (_, i) => CARD_SHEET.y + i * CARD_SHEET.h);
  return setPages(doc, [[groups, { repeat, guides: { v, h } }]]);
}

// ---------------------------------------------------------------------------------------------
// Greeting cards
// ---------------------------------------------------------------------------------------------

function thankYouCard() {
  const doc = newDoc({ title: 'Thank You Card', size: 'card5x7', schemeId: 'rosewood', fontSchemeId: 'display', margins: 36, category: 'greetingCards' });
  return setPages(doc, [
    [[
      outline(24, 24, 432, 624, '@accent2', 1, { name: 'Border' }),
      shape('ellipse', 140, 196, 200, 200, '@accent2', { opacity: 0.35, name: 'Circle' }),
      text(doc, 40, 226, 400, 140, p('With<br>Gratitude'), { font: '@heading', italic: true, size: 42, align: 'center', color: '@accent', lineHeight: 1.05 }, { name: 'Greeting', valign: 'middle' }),
      shape('star', 228, 452, 24, 24, '@accent', { name: 'Star' }),
      text(doc, 40, 556, 400, 30, p('for all that you do'), { italic: true, align: 'center', size: 13, color: '@muted' }, { name: 'Subtitle' })
    ]],
    [[
      text(doc, 64, 176, 352, 290, p('Dear friend,', 'margin-bottom: 12px') +
        p('Thank you for your kindness, your patience, and the many small things you never needed to do. They were noticed, and they mattered more than you know.', 'margin-bottom: 12px') +
        p('With warmest regards,'), { size: 12.5, lineHeight: 1.65 }, { name: 'Message' }),
      text(doc, 64, 470, 352, 50, p('Clara'), { font: '@heading', italic: true, size: 26, color: '@accent' }, { name: 'Signature' }),
      shape('star', 228, 600, 16, 16, '@accent2', { name: 'Star' })
    ]]
  ]);
}

function birthdayCard() {
  const doc = newDoc({ title: 'Birthday Card', size: 'card5x7', schemeId: 'citrus', fontSchemeId: 'display', margins: 36, category: 'greetingCards' });
  const confetti = [
    ['ellipse', 64, 70, 18, '@accent'], ['star', 380, 56, 26, '@accent2'], ['triangle', 120, 150, 16, '@accent2'], ['ellipse', 330, 140, 12, '@accent'],
    ['diamond', 410, 210, 16, '@accent'], ['star', 52, 250, 20, '@accent'], ['ellipse', 250, 92, 10, '@accent2'], ['triangle', 400, 470, 18, '@accent'],
    ['ellipse', 70, 500, 14, '@accent2'], ['star', 180, 560, 18, '@accent2'], ['diamond', 330, 590, 14, '@accent2'], ['ellipse', 420, 560, 20, '@accent']
  ].map(([k, x, y, s, c], i) => shape(k, x, y, s, s, c, { name: `Confetti ${i + 1}`, rot: (i * 37) % 90 }));
  return setPages(doc, [
    [[
      ...confetti,
      text(doc, 40, 230, 400, 150, p('Happy<br>Birthday'), { font: '@heading', size: 50, align: 'center', color: '@ink', lineHeight: 1.0 }, { name: 'Greeting', valign: 'middle' }),
      hline(200, 400, 80, '@accent', 3, { name: 'Accent rule' }),
      text(doc, 40, 420, 400, 30, p('to someone truly wonderful'), { italic: true, align: 'center', size: 14, color: '@muted' }, { name: 'Subtitle' })
    ]],
    [[
      shape('star', 228, 120, 24, 24, '@accent', { name: 'Star' }),
      text(doc, 64, 176, 352, 260, p('Another year of adventures, good food and terrible jokes — here’s to many more.', 'margin-bottom: 12px') +
        p('Wishing you a day as bright and generous as you are, and a year full of everything that makes you happy.', 'margin-bottom: 12px') +
        p('With love,'), { size: 13, lineHeight: 1.6, align: 'center' }, { name: 'Message' }),
      text(doc, 64, 446, 352, 50, p('Sam &amp; Priya'), { font: '@heading', size: 26, color: '@accent', align: 'center' }, { name: 'Signature' })
    ]]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

function weddingInvitation() {
  const doc = newDoc({ title: 'Wedding Invitation', size: 'card5x7', schemeId: 'midnight', fontSchemeId: 'classic', margins: 40, category: 'invitations' });
  const frame = () => [outline(26, 26, 428, 620, '@accent2', 1.25, { name: 'Outer border' }), outline(34, 34, 412, 604, '@accent2', 0.5, { name: 'Inner border' })];
  return setPages(doc, [
    [[
      ...frame(),
      text(doc, 50, 92, 380, 30, p('Together with their families'), { caps: true, letterSpacing: 3, size: 8.5, align: 'center', color: '@muted' }, { name: 'Lead-in', valign: 'middle' }),
      text(doc, 50, 146, 380, 190, p('Isabel<br><i>&amp;</i><br>Thomas'), { font: '@heading', size: 40, align: 'center', lineHeight: 1.12, color: '@accent' }, { name: 'Names', valign: 'middle' }),
      hline(180, 352, 120, '@accent2', 1, { ornament: 'diamond', name: 'Ornament' }),
      text(doc, 50, 380, 380, 70, p('request the pleasure of your company<br>at the celebration of their marriage'), { italic: true, size: 12, align: 'center', lineHeight: 1.6 }, { name: 'Request' }),
      text(doc, 50, 466, 380, 90, p('Saturday, the twelfth of June<br>at four o’clock in the afternoon<br>Rosecliff Gardens, Newport'), { size: 11, align: 'center', lineHeight: 1.75 }, { name: 'Date & place' }),
      text(doc, 50, 576, 380, 30, p('Reception to follow'), { italic: true, size: 10.5, align: 'center', color: '@muted' }, { name: 'Reception note' })
    ]],
    [[
      ...frame(),
      text(doc, 50, 80, 380, 40, p('The Celebration'), { font: '@heading', size: 24, align: 'center', color: '@accent' }, { name: 'Heading' }),
      ...ornamentDivider(170, 132, 140),
      text(doc, 64, 156, 352, 300,
        p(span('Ceremony', css.caps + '; font-size: 8.5pt; color: var(--folio-muted)'), 'margin-bottom: 2px') + p('Four o’clock in the rose garden', 'margin-bottom: 14px') +
        p(span('Dinner &amp; dancing', css.caps + '; font-size: 8.5pt; color: var(--folio-muted)'), 'margin-bottom: 2px') + p('Six o’clock in the Orangery', 'margin-bottom: 14px') +
        p(span('Dress', css.caps + '; font-size: 8.5pt; color: var(--folio-muted)'), 'margin-bottom: 2px') + p('Garden formal — flat shoes recommended for the lawn', 'margin-bottom: 14px') +
        p(span('Stay', css.caps + '; font-size: 8.5pt; color: var(--folio-muted)'), 'margin-bottom: 2px') + p('Rooms are held at the Harbour Inn under “Isabel &amp; Thomas”'),
        { size: 11, align: 'center', lineHeight: 1.5 }, { name: 'Details' }),
      hline(170, 480, 140, '@accent2', 0.75, { name: 'Rule' }),
      text(doc, 64, 498, 352, 90, p(span('Kindly reply by the first of May', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 6px') +
        p('isabelandthomas.example · (555) 014 5512'), { size: 10, align: 'center', lineHeight: 1.5, color: '@muted' }, { name: 'RSVP' })
    ]]
  ]);
}

function partyInvitation() {
  const doc = newDoc({ title: 'Party Invitation', size: 'card5x7', schemeId: 'plum', fontSchemeId: 'display', margins: 36, category: 'invitations' });
  const balloon = (x, y, d, c, i) => [
    shape('ellipse', x, y, d, d * 1.2, c, { name: `Balloon ${i}` }),
    vline(x + d / 2, y + d * 1.2, 90, '@paper', 0.75, { name: `Balloon string ${i}`, opacity: 0.7 })
  ];
  return setPages(doc, [
    [[
      ...balloon(70, 60, 70, '@accent2', 1), ...balloon(330, 40, 84, '@light', 2), ...balloon(210, 96, 56, '@accent2', 3),
      text(doc, 40, 300, 400, 30, p('Come celebrate'), { caps: true, letterSpacing: 4, size: 11, align: 'center', color: '@accent2' }, { name: 'Lead-in' }),
      text(doc, 40, 334, 400, 142, p('You’re<br>Invited'), { font: '@heading', size: 50, align: 'center', color: '@paper', lineHeight: 1.0 }, { name: 'Headline', valign: 'middle' }),
      hline(200, 488, 80, '@accent2', 2, { name: 'Rule' }),
      text(doc, 40, 510, 400, 70, p('to Leo’s fortieth birthday party'), { italic: true, size: 17, align: 'center', color: '@paper' }, { name: 'Occasion' })
    ], { background: solidBg('@accent') }],
    [[
      text(doc, 56, 70, 368, 50, p('The details'), { font: '@heading', size: 28, align: 'center', color: '@accent' }, { name: 'Heading' }),
      ...ornamentDivider(180, 132, 120),
      text(doc, 56, 160, 368, 330,
        p(span('When', css.caps + '; font-size: 8.5pt; color: var(--folio-accent2)')) + p('Saturday 14 March, from 7 pm until late', 'margin-bottom: 16px') +
        p(span('Where', css.caps + '; font-size: 8.5pt; color: var(--folio-accent2)')) + p('The Boathouse, 3 Riverside Walk', 'margin-bottom: 16px') +
        p(span('Bring', css.caps + '; font-size: 8.5pt; color: var(--folio-accent2)')) + p('Your dancing shoes and a story about Leo', 'margin-bottom: 16px') +
        p(span('Food', css.caps + '; font-size: 8.5pt; color: var(--folio-accent2)')) + p('Tacos, cake and a very good playlist'),
        { size: 13, align: 'center', lineHeight: 1.5 }, { name: 'Details' }),
      rect(96, 520, 288, 80, '@light', { name: 'RSVP panel' }),
      text(doc, 96, 520, 288, 80, p(span('RSVP by 1 March', `${css.heading}; font-size: 15pt`)) + p('Maya · (555) 014 7342'),
        { size: 10.5, align: 'center', lineHeight: 1.4 }, { name: 'RSVP', valign: 'middle' })
    ]]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Postcards
// ---------------------------------------------------------------------------------------------

function addressSide(doc, message, signature) {
  return [
    text(doc, 28, 32, 244, 236, message, { italic: true, size: 10.5, lineHeight: 1.6 }, { name: 'Message' }),
    text(doc, 28, 288, 244, 40, p(signature), { font: '@heading', italic: true, size: 20, color: '@accent' }, { name: 'Signature' }),
    vline(300, 28, 328, '@muted', 0.75, { name: 'Divider' }),
    outline(476, 24, 76, 92, '@muted', 1, { dash: 'dash', name: 'Stamp box' }),
    text(doc, 476, 24, 76, 92, p('Place<br>stamp<br>here'), { size: 7, caps: true, letterSpacing: 1, color: '@muted', align: 'center', lineHeight: 1.4 }, { name: 'Stamp label', valign: 'middle' }),
    text(doc, 324, 176, 228, 92, p(ADDRESS_BLOCK), { size: 11.5, lineHeight: 1.5 }, { name: 'Recipient address' }),
    hline(324, 284, 228, '@light', 1, { name: 'Address rule' })
  ];
}

function coastalPostcard() {
  const doc = newDoc({ title: 'Greetings from the Coast', size: 'postcard', schemeId: 'sage', fontSchemeId: 'editorial', margins: 24, category: 'postcards' });
  return setPages(doc, [
    [[
      picture(0, 0, 576, 384, { name: 'Coastline photo' }),
      rect(0, 270, 576, 114, '@accent', { opacity: 0.92, name: 'Title band' }),
      text(doc, 28, 284, 520, 48, p('Greetings from the <i>Coast</i>'), { font: '@heading', size: 29, color: '@paper' }, { name: 'Title', valign: 'middle' }),
      text(doc, 28, 338, 520, 22, p('Port Halden · Summer 2026'), { size: 9, caps: true, letterSpacing: 3, color: '@accent2' }, { name: 'Place' })
    ]],
    [addressSide(doc, p('Wish you were here — the light this time of year is extraordinary, and the bakery on the harbour still makes those cardamom buns.', 'margin-bottom: 8px') +
      p('We walked the cliff path to the lighthouse this morning and saw seals on the rocks below. Back on Thursday, with too many shells.'), 'Ana')]
  ]);
}

function openStudioPostcard() {
  const doc = newDoc({ title: 'Open Studio Postcard', size: 'postcard', schemeId: 'lagoon', fontSchemeId: 'modern', margins: 24, category: 'postcards' });
  return setPages(doc, [
    [[
      rect(0, 0, 288, 384, '@accent', { name: 'Colour panel' }),
      picture(288, 0, 288, 384, { name: 'Artwork photo' }),
      text(doc, 28, 40, 236, 20, p('You are invited'), { size: 9, caps: true, letterSpacing: 3, color: '@accent2' }, { name: 'Lead-in' }),
      text(doc, 28, 70, 236, 150, p('Open<br>Studio<br>Weekend'), { font: '@heading', size: 36, color: '@paper', lineHeight: 1.02 }, { name: 'Title' }),
      hline(28, 240, 48, '@accent2', 2, { name: 'Rule' }),
      text(doc, 28, 258, 236, 90, p('<b>Sat &amp; Sun, 7–8 November</b><br>11 am – 5 pm<br>Unit 4, The Old Dairy, Kilnworth'), { size: 10.5, lineHeight: 1.55, color: '@paper' }, { name: 'Details' })
    ]],
    [addressSide(doc, p('New paintings, prints and ceramics from twelve resident artists, plus live demonstrations at noon and three each day.', 'margin-bottom: 8px') +
      p('Free entry, coffee and cake in the yard, and parking at the farm shop next door.'), 'See you there!')]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------------------------

function awardCertificate() {
  const doc = newDoc({ title: 'Certificate of Excellence', size: 'certificate', schemeId: 'ivory', fontSchemeId: 'classic', margins: 48, category: 'certificates' });
  const corners = [[36, 36], [1020, 36], [36, 780], [1020, 780]].map(([x, y], i) => shape('diamond', x - 9, y - 9, 18, 18, '@accent2', { name: `Corner ${i + 1}` }));
  const sig = (x, name, role) => [
    hline(x, 664, 260, '@ink', 0.75, { name: 'Signature line' }),
    text(doc, x, 674, 260, 44, p(`<b>${name}</b><br>${role}`), { size: 10, align: 'center', lineHeight: 1.45, color: '@muted' }, { name: 'Signatory' })
  ];
  return setPages(doc, [[[
    outline(24, 24, 1008, 768, '@accent', 3, { name: 'Outer border' }),
    outline(36, 36, 984, 744, '@accent2', 1, { name: 'Inner border' }),
    ...corners,
    text(doc, 96, 104, 864, 24, p('The Ashford Arts Council'), { size: 11, caps: true, letterSpacing: 5, color: '@accent2', align: 'center' }, { name: 'Organisation' }),
    text(doc, 96, 140, 864, 92, p('Certificate of Excellence'), { font: '@heading', size: 54, color: '@accent', align: 'center' }, { name: 'Title', valign: 'middle' }),
    ...ornamentDivider(408, 256, 240),
    text(doc, 96, 282, 864, 30, p('This certificate is proudly presented to'), { italic: true, size: 15, color: '@muted', align: 'center' }, { name: 'Presented to' }),
    text(doc, 96, 322, 864, 84, p('Jordan Ellison'), { font: '@heading', size: 48, align: 'center' }, { name: 'Recipient', valign: 'middle' }),
    hline(288, 416, 480, '@accent2', 1, { name: 'Name rule' }),
    text(doc, 168, 436, 720, 70, p('in recognition of outstanding achievement in community arts, and for three years of generous service to the Ashford Youth Theatre.'),
      { size: 13, align: 'center', lineHeight: 1.55 }, { name: 'Citation' }),
    shape('burst', 468, 556, 120, 120, '@accent2', { points: 24, inner: 0.86, name: 'Seal' }),
    shape('ellipse', 484, 572, 88, 88, '@accent', { name: 'Seal centre' }),
    text(doc, 484, 572, 88, 88, p(span('2026', 'font-size: 15pt')) + p('Award'), { font: '@heading', size: 9, caps: true, letterSpacing: 1, color: '@paper', align: 'center', lineHeight: 1.15 },
      { name: 'Seal text', valign: 'middle' }),
    ...sig(150, 'Catherine Moore', 'Chair, Ashford Arts Council'),
    ...sig(646, 'Presented 12 June 2026', 'Ashford, Connecticut')
  ]]]);
}

function completionCertificate() {
  const doc = newDoc({ title: 'Certificate of Completion', size: 'certificate', schemeId: 'midnight', fontSchemeId: 'didone', margins: 48, category: 'certificates' });
  const col = (x, label, value) => [
    hline(x, 650, 240, '@ink', 0.75, { name: `${label} line` }),
    text(doc, x, 660, 240, 44, p(`<b>${value}</b><br>${label}`), { size: 10, align: 'center', lineHeight: 1.45, color: '@muted' }, { name: label })
  ];
  return setPages(doc, [[[
    outline(40, 40, 976, 736, '@accent', 1.5, { name: 'Border' }),
    rect(40, 40, 976, 110, '@accent', { name: 'Title band' }),
    text(doc, 80, 60, 896, 70, p('Certificate of Completion'), { font: '@heading', size: 38, color: '@paper', align: 'center' }, { name: 'Title', valign: 'middle' }),
    text(doc, 80, 196, 896, 26, p('This is to certify that'), { italic: true, size: 15, color: '@muted', align: 'center' }, { name: 'Lead-in' }),
    text(doc, 80, 234, 896, 80, p('Samuel Okonkwo'), { font: '@heading', size: 46, align: 'center' }, { name: 'Recipient', valign: 'middle' }),
    hline(278, 328, 500, '@accent2', 1.5, { name: 'Name rule' }),
    text(doc, 130, 350, 796, 26, p('has successfully completed'), { size: 14, align: 'center' }, { name: 'Completed' }),
    text(doc, 130, 384, 796, 50, p('Foundations of Bookkeeping'), { font: '@heading', size: 27, color: '@accent', align: 'center' }, { name: 'Course', valign: 'middle' }),
    text(doc, 170, 444, 716, 56, p('a 24-hour professional course held from 2 March to 27 April 2026 at the Harbor Community College School of Business.'),
      { size: 12.5, align: 'center', lineHeight: 1.5, color: '@muted' }, { name: 'Course details' }),
    ...logoMark(doc, 478, 560, 100, 'HC', '@accent2', '@paper'),
    ...col(150, 'Date of completion', '27 April 2026'),
    ...col(666, 'Course instructor', 'Dr. Lena Hartmann')
  ]]]);
}

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: Function}>} */
export const CARD_TEMPLATES = [
  { id: 'business-card-classic', name: 'Classic Business Card', category: 'businessCards', description: 'Two-sided card: dark front with name and title, details on the back.', sizeLabel: '3.5 × 2 in · 2 sides', build: cardClassic },
  { id: 'business-card-modern', name: 'Modern Business Card', category: 'businessCards', description: 'Colour panel with a logo mark, clean contact details and a branded back.', sizeLabel: '3.5 × 2 in · 2 sides', build: cardModern },
  { id: 'business-card-sheet', name: 'Business Cards Sheet', category: 'businessCards', description: 'Ten cards per Letter sheet with Name, Title, Email and Phone merge fields — one recipient per card.', sizeLabel: 'Letter · 10 cards (2 × 5)', build: cardSheet },
  { id: 'thank-you-card', name: 'Thank You Card', category: 'greetingCards', description: 'Folded thank-you card with a hand-lettered feel and an inside message.', sizeLabel: '5 × 7 in · front + inside', build: thankYouCard },
  { id: 'birthday-card', name: 'Birthday Card', category: 'greetingCards', description: 'Cheerful folded birthday card scattered with confetti.', sizeLabel: '5 × 7 in · front + inside', build: birthdayCard },
  { id: 'wedding-invitation', name: 'Wedding Invitation', category: 'invitations', description: 'Formal wedding invitation with a double border and an inside details page.', sizeLabel: '5 × 7 in · front + inside', build: weddingInvitation },
  { id: 'party-invitation', name: 'Party Invitation', category: 'invitations', description: 'Festive invitation with balloons, party details and RSVP.', sizeLabel: '5 × 7 in · front + inside', build: partyInvitation },
  { id: 'coastal-postcard', name: 'Picture Postcard', category: 'postcards', description: 'Photo postcard with a title band and a mail-merge address side.', sizeLabel: '6 × 4 in · 2 sides', build: coastalPostcard },
  { id: 'open-studio-postcard', name: 'Event Postcard', category: 'postcards', description: 'Event announcement postcard with a merge-field address block.', sizeLabel: '6 × 4 in · 2 sides', build: openStudioPostcard },
  { id: 'award-certificate', name: 'Award Certificate', category: 'certificates', description: 'Landscape award with a double border, seal and two signature lines.', sizeLabel: '11 × 8.5 in landscape', build: awardCertificate },
  { id: 'completion-certificate', name: 'Certificate of Completion', category: 'certificates', description: 'Course completion certificate with a title band, emblem and signature lines.', sizeLabel: '11 × 8.5 in landscape', build: completionCertificate }
];
