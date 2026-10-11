// Templates: flyers, posters, brochures and newsletters.

import { IN, newDoc, text, rect, shape, outline, hline, vline, picture, table, setPages, addMaster, linkFrames,
  p, span, field, solidBg, css } from './kit.js';
import { tearOffStrips } from './parts.js';

const C = 'text-align: center';

// ---------------------------------------------------------------------------------------------
// Flyers
// ---------------------------------------------------------------------------------------------

function eventFlyer() {
  const doc = newDoc({ title: 'An Evening of Jazz', size: 'letter', schemeId: 'midnight', fontSchemeId: 'didone', margins: 0.75 * IN, category: 'flyers' });
  const info = (x, head, body) => text(doc, x, 744, 200, 104, p(`<b>${head}</b>`, 'margin-bottom: 4px') + p(body),
    { size: 11.5, align: 'center', lineHeight: 1.55 }, { name: head });
  return setPages(doc, [[[
    rect(0, 0, 816, 440, '@accent', { name: 'Header band' }),
    text(doc, 80, 78, 656, 24, p('The Hartwell Society presents'), { size: 11, color: '@accent2', align: 'center', caps: true, letterSpacing: 4 }, { name: 'Presenter' }),
    text(doc, 60, 120, 696, 190, p('An Evening<br>of Jazz'), { font: '@heading', size: 62, color: '@paper', align: 'center', lineHeight: 1.04 }, { name: 'Title' }),
    hline(348, 336, 120, '@accent2', 1.5, { ornament: 'diamond', name: 'Ornament' }),
    text(doc, 80, 360, 656, 32, p('Saturday, the fourteenth of November'), { italic: true, size: 17, color: '@paper', align: 'center' }, { name: 'Date' }),
    shape('star', 396, 486, 24, 24, '@accent2', { name: 'Star' }),
    text(doc, 118, 536, 580, 150, p('Join us beneath the chandeliers for a night of standards, small plates and good company. The Linden Quartet takes the stage at eight o’clock, with dancing until late.'),
      { size: 14, align: 'center', lineHeight: 1.7 }, { name: 'Description' }),
    info(80, 'When', 'Seven until eleven<br>Doors at half past six'),
    info(308, 'Where', 'The Linden Room<br>42 Mercer Street'),
    info(536, 'Tickets', '$45 · Members $30<br>hartwell.example'),
    hline(80, 900, 656, '@muted', 0.75, { name: 'Footer rule' }),
    text(doc, 80, 922, 656, 30, p('Black tie optional · Kindly reply by the first of November'), { italic: true, size: 12, color: '@muted', align: 'center' }, { name: 'Footer' })
  ]]]);
}

function saleFlyer() {
  const doc = newDoc({ title: 'Autumn Clearance', size: 'letter', schemeId: 'citrus', fontSchemeId: 'display', margins: 56, category: 'flyers' });
  const feature = (x, head, body) => text(doc, x, 772, 220, 84,
    p(span(head, `${css.heading}; font-size: 17pt; ${css.accent}`), 'margin-bottom: 4px') + p(body), { size: 10.5, lineHeight: 1.45 }, { name: head });
  return setPages(doc, [[[
    rect(0, 0, 816, 18, '@accent', { name: 'Top strip' }),
    text(doc, 56, 60, 460, 22, p('Hollis &amp; Pine · Home Goods'), { size: 11, caps: true, letterSpacing: 3, color: '@muted' }, { name: 'Store name' }),
    text(doc, 56, 96, 470, 240, p('The Autumn<br>Clearance<br>Event'), { font: '@heading', size: 58, lineHeight: 1.0 }, { name: 'Headline' }),
    text(doc, 56, 348, 440, 84, p('Three days only — Friday to Sunday, October 9–11. Doors open at nine, with coffee on us for early birds.'),
      { size: 14, lineHeight: 1.45 }, { name: 'Dates' }),
    shape('burst', 532, 88, 244, 244, '@accent', { name: 'Starburst', points: 16, inner: 0.78 }),
    text(doc, 572, 150, 164, 120, p('Up to') + p(span('40%', 'font-size: 44pt')) + p('off'),
      { font: '@heading', size: 18, color: '@paper', align: 'center', lineHeight: 1.0 }, { name: 'Discount', valign: 'middle' }),
    picture(56, 448, 704, 300, { name: 'Showroom photo' }),
    feature(56, 'Furniture', 'Sofas, dining sets and reading chairs from the showroom.'),
    feature(298, 'Lighting', 'Brass floor lamps, linen shades and pendant lights in every finish.'),
    feature(540, 'Linens', 'Stonewashed bedding, wool throws and table linens by the yard.'),
    outline(56, 876, 704, 124, '@ink', 1.5, { dash: 'dash', name: 'Coupon border' }),
    text(doc, 80, 892, 400, 92, p(span('Bring this flyer', `${css.heading}; font-size: 21pt; ${css.accent}`), 'margin-bottom: 4px') +
      p('Take an extra 10% off any one item. One coupon per household; valid October 9–11 only.'), { size: 10.5, lineHeight: 1.45 }, { name: 'Coupon text', valign: 'middle' }),
    vline(504, 892, 92, '@muted', 1, { dash: 'dash', name: 'Coupon divider' }),
    text(doc, 520, 892, 216, 92, p('Extra<br>10% off'), { font: '@heading', size: 28, color: '@accent', align: 'center', lineHeight: 1.0, caps: true },
      { name: 'Coupon offer', valign: 'middle' }),
    text(doc, 56, 1014, 704, 20, p('214 Mercer Avenue · Open 9–7 daily · hollisandpine.example'), { size: 9.5, color: '@muted', align: 'center' }, { name: 'Footer' })
  ]]]);
}

function tearOffFlyer() {
  const doc = newDoc({ title: 'Piano Lessons', size: 'letter', schemeId: 'harbor', fontSchemeId: 'modern', margins: 56, category: 'flyers' });
  return setPages(doc, [[[
    text(doc, 56, 64, 704, 22, p('Now enrolling for the spring term'), { size: 12, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
    text(doc, 56, 98, 704, 150, p('Piano Lessons<br>for All Ages'), { font: '@heading', size: 50, lineHeight: 1.05 }, { name: 'Headline' }),
    hline(56, 262, 120, '@accent2', 3, { name: 'Accent rule' }),
    picture(56, 290, 330, 330, { name: 'Studio photo', radius: 4 }),
    text(doc, 412, 290, 348, 330,
      p('Patient, structured lessons in a bright studio with a newly restored grand piano. Learn to read music, play the pieces you love and perform with confidence.', 'margin-bottom: 10px') +
      '<ul><li>Beginners welcome from age six</li><li>Adult returners and late starters</li><li>Exam preparation, grades 1–8</li><li>Weekday afternoons and Saturday mornings</li></ul>',
      { size: 12, lineHeight: 1.5 }, { name: 'Details' }),
    rect(56, 646, 704, 120, '@light', { name: 'Offer panel' }),
    text(doc, 80, 662, 656, 88, p(span('Your first lesson is free', `${css.heading}; font-size: 20pt; ${css.accent}`), 'margin-bottom: 4px') +
      p('A thirty-minute trial lesson with no obligation. The studio is on Linden Street, two minutes from the station.'),
      { size: 11.5, lineHeight: 1.45 }, { name: 'Offer', valign: 'middle' }),
    ...tearOffStrips(doc, { x: 56, y: 800, w: 704, h: 232, count: 8, line1: 'Piano lessons · Ms. Adeyemi', line2: '(555) 014 3381' })
  ]]]);
}

// ---------------------------------------------------------------------------------------------
// Posters
// ---------------------------------------------------------------------------------------------

function lecturePoster() {
  const doc = newDoc({ title: 'Ideas Worth Keeping', size: 'tabloid', schemeId: 'lagoon', fontSchemeId: 'modern', margins: 90, category: 'posters' });
  const W = { color: '@paper' };
  return setPages(doc, [[[
    text(doc, 90, 120, 876, 30, p('Spring Lecture Series · 2027'), { size: 14, caps: true, letterSpacing: 5, color: '@accent2' }, { name: 'Series' }),
    text(doc, 82, 176, 900, 610, p('Ideas<br>Worth<br><i>Keeping</i>'), { font: '@heading', size: 150, lineHeight: 0.98, ...W }, { name: 'Title' }),
    shape('ellipse', 700, 830, 266, 266, '@accent2', { name: 'Circle' }),
    text(doc, 724, 893, 218, 140, p(span('6', 'font-size: 64pt')) + p('evenings'), { font: '@heading', size: 22, color: '@accent', align: 'center', lineHeight: 1.0 },
      { name: 'Circle label', valign: 'middle' }),
    text(doc, 90, 860, 560, 200, p('Six evenings with writers, historians and makers on the craft of making things that last.'), { size: 24, lineHeight: 1.4, ...W }, { name: 'Description' }),
    text(doc, 90, 1110, 420, 166,
      p('<b>Mar 4</b> · The Long Life of Paper') + p('<b>Mar 11</b> · Repair as a Radical Act') + p('<b>Mar 18</b> · Cities Built to Outlast Us'),
      { size: 15, lineHeight: 1.6, spaceAfter: 6, ...W }, { name: 'Programme 1' }),
    text(doc, 546, 1110, 420, 166,
      p('<b>Mar 25</b> · Recipes as Inheritance') + p('<b>Apr 1</b> · The Archive in Your Attic') + p('<b>Apr 8</b> · Gardens for the Next Century'),
      { size: 15, lineHeight: 1.6, spaceAfter: 6, ...W }, { name: 'Programme 2' }),
    hline(90, 1300, 876, '@paper', 1.5, { opacity: 0.6, name: 'Rule' }),
    text(doc, 90, 1334, 420, 120, p('<b>Thursdays at seven</b><br>March 4 – April 8<br>Founders Hall, Room 210'), { size: 16, lineHeight: 1.6, ...W }, { name: 'When & where' }),
    text(doc, 546, 1334, 420, 120, p('Free and open to all<br>Reserve a seat at<br><i>lectures.example.edu</i>'), { size: 16, lineHeight: 1.6, align: 'right', ...W }, { name: 'Booking' })
  ], { background: solidBg('@accent') }]]);
}

function concertPoster() {
  const doc = newDoc({ title: 'Midsummer Nocturnes', size: 'poster18x24', schemeId: 'plum', fontSchemeId: 'display', margins: 144, category: 'posters' });
  const info = (x, head, body) => text(doc, x, 2010, 440, 130, p(span(head, `${css.accent2}; text-transform: uppercase; letter-spacing: 4px; font-size: 15pt`), 'margin-bottom: 6px') + p(body),
    { size: 22, color: '@paper', align: 'center', lineHeight: 1.4 }, { name: head });
  return setPages(doc, [[[
    shape('ellipse', 324, 220, 1080, 1080, '@accent2', { name: 'Sun disc', opacity: 0.9 }),
    picture(404, 300, 920, 920, { name: 'Performer photo', radius: 460 }),
    text(doc, 144, 1390, 1440, 44, p('The Riverside Festival Orchestra presents'), { size: 22, caps: true, letterSpacing: 8, color: '@accent2', align: 'center' }, { name: 'Presenter' }),
    text(doc, 104, 1470, 1520, 340, p('Midsummer<br>Nocturnes'), { font: '@heading', size: 120, color: '@paper', align: 'center', lineHeight: 1.0 }, { name: 'Title' }),
    hline(744, 1852, 240, '@accent2', 2, { ornament: 'diamond', name: 'Ornament' }),
    text(doc, 144, 1888, 1440, 54, p('Works by Debussy, Fauré &amp; Lili Boulanger'), { italic: true, size: 28, color: '@paper', align: 'center' }, { name: 'Programme' }),
    info(144, 'When', 'Friday 24 July<br>Eight o’clock'),
    info(644, 'Where', 'Harbourside Pavilion<br>Pier Road'),
    info(1144, 'Tickets', 'From $28<br>Under 18s free'),
    text(doc, 144, 2200, 1440, 40, p('riversidefestival.example · Gates open at half past six'), { size: 16, color: '@accent2', align: 'center', letterSpacing: 2 }, { name: 'Footer' })
  ], { background: solidBg('@accent') }]]);
}

// ---------------------------------------------------------------------------------------------
// Brochures
// ---------------------------------------------------------------------------------------------

function trifoldBrochure() {
  const doc = newDoc({ title: 'Fernhill Botanical Garden', size: 'letter', orientation: 'landscape', schemeId: 'sage', fontSchemeId: 'editorial',
    margins: 48, columns: { count: 3, gutter: 96 }, category: 'brochures' });
  const X = [48, 400, 752], PW = 256;
  const kicker = (x, y, t) => text(doc, x, y, PW, 18, p(t), { size: 9, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' });
  const head = (x, y, h, t) => text(doc, x, y, PW, h, p(t), { font: '@heading', size: 21, lineHeight: 1.15 }, { name: 'Heading' });
  const body = (x, y, h, html, name = 'Body') => text(doc, x, y, PW, h, html, { size: 10, lineHeight: 1.55, spaceAfter: 6 }, { name });
  const guides = { v: [352, 704], h: [] };
  const outside = [
    // panel 1: inside flap
    kicker(X[0], 64, 'Become a member'),
    head(X[0], 90, 72, 'Grow with us all year round'),
    body(X[0], 172, 190, p('Members keep Fernhill blooming. Your support pays for new plantings, keeps the glasshouses warm through winter and funds free visits for local schools.') +
      p('Membership starts the day you join and includes unlimited visits for a full year.')),
    rect(X[0], 380, PW, 300, '@light', { name: 'Membership panel' }),
    text(doc, X[0] + 18, 398, PW - 36, 264,
      p(span('Individual', css.heading) + ' — $55', 'margin-bottom: 2px') + p(span('Free entry, member newsletter', css.muted), 'margin-bottom: 10px') +
      p(span('Household', css.heading) + ' — $90', 'margin-bottom: 2px') + p(span('Two adults and children under 18', css.muted), 'margin-bottom: 10px') +
      p(span('Patron', css.heading) + ' — $250', 'margin-bottom: 2px') + p(span('All of the above, plus private evening tours', css.muted), 'margin-bottom: 10px') +
      p('<b>Join at the visitor centre or at fernhill.example/join</b>'),
      { size: 11, lineHeight: 1.4 }, { name: 'Membership tiers' }),
    text(doc, X[0], 700, PW, 66, p('“The best hour of my week is spent on the bench by the lily pond.” — Marguerite, member since 2009'),
      { italic: true, size: 10, color: '@muted', lineHeight: 1.45 }, { name: 'Testimonial' }),
    // panel 2: back cover
    picture(X[1], 64, PW, 200, { name: 'Map placeholder' }),
    text(doc, X[1], 284, PW, 28, p('Plan your visit'), { font: '@heading', size: 18 }, { name: 'Heading' }),
    body(X[1], 320, 250, p('<b>Hours</b><br>Daily, 9 am – 6 pm (until 4 pm November to February)') +
      p('<b>Address</b><br>1200 Fernhill Road, Ashford') + p('<b>Getting here</b><br>Bus 14 stops at the main gate. Free parking for bicycles; car park $4 per day.') +
      p('<b>Accessibility</b><br>Step-free paths throughout; wheelchairs available to borrow.')),
    hline(X[1] + 98, 660, 60, '@accent2', 1.5, { ornament: 'diamond', name: 'Ornament' }),
    text(doc, X[1], 680, PW, 70, p(span('Fernhill Botanical Garden', `${css.heading}; font-size: 15pt`)) + p('fernhill.example · (555) 014 7720'),
      { size: 9.5, align: 'center', color: '@muted', lineHeight: 1.5 }, { name: 'Contact' }),
    // panel 3: front cover
    rect(704, 0, 352, 816, '@accent', { name: 'Cover background' }),
    picture(X[2], 64, PW, 380, { name: 'Cover photo', radius: 2 }),
    text(doc, X[2], 466, PW, 150, p('Fernhill<br>Botanical<br>Garden'), { font: '@heading', size: 36, color: '@paper', lineHeight: 1.05 }, { name: 'Cover title' }),
    hline(X[2], 630, 60, '@accent2', 2, { name: 'Cover rule' }),
    text(doc, X[2], 648, PW, 50, p('A visitor’s guide to the seasons'), { italic: true, size: 15, color: '@paper' }, { name: 'Cover subtitle' }),
    text(doc, X[2], 734, PW, 20, p('Open daily · 9 am – 6 pm'), { size: 9.5, caps: true, letterSpacing: 2, color: '@accent2' }, { name: 'Cover hours' })
  ];
  const inside = [
    kicker(X[0], 64, 'Welcome'),
    head(X[0], 90, 72, 'Forty acres of quiet wonder'),
    body(X[0], 172, 330, p('Fernhill began in 1921 as a nursery for the town’s street trees. A century later it is home to more than four thousand plant species, two Victorian glasshouses and a walled kitchen garden that still feeds our café.') +
      p('Wander the woodland walk, sit beside the lily pond, or join one of our gardeners for a free tour every Saturday at eleven.') +
      p('Whatever the season, there is always something coming into flower.')),
    hline(X[0], 524, PW, '@accent2', 1),
    text(doc, X[0], 540, PW, 140, p('“A garden is a slow conversation between people and place.”'), { font: '@heading', italic: true, size: 18, color: '@accent', lineHeight: 1.3 }, { name: 'Pull quote' }),
    hline(X[0], 696, PW, '@accent2', 1),
    picture(X[1], 64, PW, 180, { name: 'Seasonal photo' }),
    kicker(X[1], 264, 'This season'),
    head(X[1], 288, 34, 'What to see'),
    body(X[1], 330, 420, '<ul><li><b>The Dahlia Walk</b> — over 300 varieties in full colour until the first frost.</li>' +
      '<li><b>Japanese maples</b> — the valley glows red and amber from mid-October.</li>' +
      '<li><b>Orchid house</b> — rare slipper orchids, misted twice a day.</li>' +
      '<li><b>Kitchen garden</b> — squash, kale and heritage apples ready for harvest.</li></ul>'),
    kicker(X[2], 64, 'Learn with us'),
    head(X[2], 90, 72, 'Programmes &amp; workshops'),
    body(X[2], 172, 84, p('Small-group workshops led by our horticulture team. All materials included; book online or at the visitor centre.')),
    table(X[2], 266, PW, 196, [
      ['<b>Day</b>', '<b>Workshop</b>'],
      ['Sat', 'Pruning for beginners'],
      ['Sun', 'Botanical drawing'],
      ['Wed', 'Seed saving at home'],
      ['Thu', 'Wreaths from the woods']
    ], { colWeights: [1, 3], header: true, banded: true, style: { size: 10 }, name: 'Workshop table', headerFill: '@accent', headerColor: 'paper' }),
    rect(X[2], 490, PW, 176, '@light', { name: 'Café panel' }),
    text(doc, X[2] + 16, 506, PW - 32, 144, p(span('The Glasshouse Café', `${css.heading}; font-size: 15pt; ${css.accent}`), 'margin-bottom: 6px') +
      p('Seasonal lunches from the kitchen garden, homemade cakes and the best scones in the county. Open 10 am – 4 pm.'),
      { size: 10, lineHeight: 1.5 }, { name: 'Café', valign: 'middle' })
  ];
  return setPages(doc, [[outside, { guides }], [inside, { guides }]]);
}

const PAMPHLET_ARTICLE = [
  'Long before the first bridge was built, the Millbrook was a working river. Its fall of forty feet over less than a mile made it ideal for water power, and by 1790 three mills stood along its banks: one for grain, one for timber and one, briefly and unsuccessfully, for paper.',
  'The trail you are walking follows the old mill race, the channel dug by hand to carry water from the upper pond to the wheels below. In places the stone walls are still visible beneath the ferns. Look for the dressed granite blocks near the second footbridge; each one carries the mason’s mark of the man who cut it.',
  'The grain mill was the heart of the valley. Farmers came from as far as Ashford with their carts, and the miller took one sack in ten as his fee. A ledger from 1834, now kept in the town library, records more than six hundred visits in a single autumn. On busy days the queue of carts reached back to the crossroads, and the inn by the bridge did a brisk trade in cider while people waited.',
  'Floods were a constant danger. The great flood of 1869 tore away the timber mill entirely and left the grain mill’s wheel stranded in a field half a mile downstream. It was rebuilt within a year, larger than before, with an iron wheel cast in Pittsfield. You can see a section of that wheel, rescued during the 1970s restoration, beside the picnic meadow.',
  'By the turn of the century steam had overtaken water, and the mills fell quiet one by one. The grain mill ground its last sack in 1911. For decades the buildings were used as barns and workshops, then simply left to the weather. When the Historical Society was founded in 1968, its first project was to buy the derelict mill for a single dollar and stop the roof from falling in.',
  'Life at the mill followed the seasons. Spring meltwater meant long days and full wheels; high summer brought low water and time for repairs. The miller’s family lived above the grinding floor, and the children were expected to sweep, mend sacks and keep the eels out of the race. One of them, Abigail Thorne, kept a diary from the age of nine. Her entries are brief and wonderfully practical: “Wheel stuck again. Father cross. Lambs born at Hale’s.”',
  'The timber mill, rebuilt after the flood on higher ground, cut oak and chestnut for barns across the county. Its saw ran on a crank driven by a smaller wheel, and the whine of the blade could be heard in the village on a clear day. Sawdust from the mill was sold to the ice house by the pond, where blocks cut in January were packed in it and kept frozen well into August.',
  'Not every venture succeeded. The paper mill, opened in 1802 by an ambitious Boston printer, closed within three years. The water was too hard, the rags too few and the winters too long. All that remains is a short stretch of wall and the name of the meadow beside it, still called Paper Field on the old maps.',
  'The coming of the railway in 1872 changed everything. Flour could now arrive from the great mills of the Midwest more cheaply than it could be ground locally, and the Millbrook’s farmers gradually turned from wheat to dairy. The mill adapted by grinding animal feed, but its best years were behind it.',
  'Restoration took twenty years and hundreds of volunteers. Today the mill grinds flour again on the first Sunday of every month, and the river runs clear enough for brown trout to return each spring. As you walk, notice how the valley has healed: alders along the banks, kingfishers on the old sluice gates, and children paddling where the tail race once roared.',
  'The trail ends at the upper pond, where a bench marks the spot where the first dam stood. Sit for a while. On a still morning you can hear the water slipping over the weir, the same sound that drove the wheels for more than a century.'
];

function pamphletBooklet() {
  const doc = newDoc({ title: 'The Old Mill Trail', size: 'halfLetter', schemeId: 'rosewood', fontSchemeId: 'classic',
    margins: { top: 72, right: 48, bottom: 64, left: 48 }, category: 'brochures' });
  const master = doc.masters[0];
  master.name = 'A';
  master.elements.push(
    text(doc, 48, 26, 432, 14, p('The Old Mill Trail · A Walking Guide'), { size: 7.5, caps: true, letterSpacing: 2, color: '@muted' }, { name: 'Running header' }),
    hline(48, 46, 432, '@muted', 0.5, { name: 'Header rule' }),
    hline(48, 772, 432, '@muted', 0.5, { name: 'Footer rule' }),
    text(doc, 48, 782, 432, 16, p(`— ${field('#page')} —`), { size: 9, align: 'center', color: '@muted' }, { name: 'Page number' })
  );
  const W = 432, X = 48;
  const bodyStyle = { size: 11, lineHeight: 1.55, align: 'justify', spaceAfter: 7 };
  const a1 = text(doc, X, 168, W, 592, PAMPHLET_ARTICLE.map((t) => p(t)).join(''), bodyStyle, { name: 'Article (1 of 4)' });
  const a2 = text(doc, X, 344, W, 416, '', bodyStyle, { name: 'Article (2 of 4)' });
  const a3 = text(doc, X, 72, W, 320, '', bodyStyle, { name: 'Article (3 of 4)', columns: 2, colGap: 18 });
  const a4 = text(doc, X, 72, W, 220, '', bodyStyle, { name: 'Article (4 of 4)' });
  linkFrames(doc, [a1, a2, a3, a4]);
  const caption = (y, t) => text(doc, X, y, W, 18, p(t), { italic: true, size: 9, color: '@muted' }, { name: 'Caption' });
  const notesLines = Array.from({ length: 8 }, (_, i) => hline(X, 500 + i * 28, W, '@accent2', 0.75, { name: `Notes line ${i + 1}` }));
  return setPages(doc, [
    [[
      picture(48, 48, 432, 400, { name: 'Cover photo' }),
      text(doc, 48, 474, 432, 22, p('A walking guide'), { size: 10, caps: true, letterSpacing: 4, color: '@accent2' }, { name: 'Kicker' }),
      text(doc, 48, 502, 432, 120, p('The Old<br>Mill Trail'), { font: '@heading', size: 44, color: '@paper', lineHeight: 1.0 }, { name: 'Title' }),
      hline(48, 640, 60, '@accent2', 2, { name: 'Rule' }),
      text(doc, 48, 656, 432, 50, p('Two miles of river history, from the upper pond to the grain mill'), { italic: true, size: 13, color: '@paper', lineHeight: 1.4 }, { name: 'Subtitle' }),
      text(doc, 48, 748, 432, 20, p('Published by the Millbrook Historical Society'), { size: 9, color: '@accent2', letterSpacing: 1 }, { name: 'Publisher' })
    ], { masterId: null, background: solidBg('@accent') }],
    [[
      text(doc, X, 72, W, 22, p('Before you set out'), { size: 9.5, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
      text(doc, X, 98, W, 80, p('Welcome to the valley'), { font: '@heading', size: 28, lineHeight: 1.1 }, { name: 'Heading' }),
      text(doc, X, 170, W, 250, p('The Old Mill Trail is an easy two-mile walk along the Millbrook, following the route of the mill race from the upper pond down to the restored grain mill. Allow about an hour and a half, more if you stop to explore.') +
        p('The path is level and well surfaced, though it can be muddy after rain. Numbered posts mark each of the eight stops described in this guide; a table of stops appears on page seven.') +
        p('Please keep dogs on a lead near the mill pond, where swans nest in spring, and take your litter home.'),
        { size: 10.5, lineHeight: 1.55, spaceAfter: 7 }, { name: 'Introduction' }),
      rect(X, 452, W, 260, '@light', { name: 'Checklist panel' }),
      text(doc, X + 20, 470, W - 40, 224, p(span('What to bring', `${css.heading}; font-size: 16pt; ${css.accent}`), 'margin-bottom: 8px') +
        '<ul><li>Comfortable shoes with good grip</li><li>A drink and a snack — there is a picnic meadow at stop five</li><li>Binoculars for the heron colony</li><li>This guide, and a pencil for the notes page</li></ul>' +
        p('The mill is open on the first Sunday of each month from 10 am to 3 pm.', 'margin-top: 6px'),
        { size: 10.5, lineHeight: 1.5 }, { name: 'Checklist' })
    ]],
    [[
      text(doc, X, 72, W, 22, p('History'), { size: 9.5, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
      text(doc, X, 98, W, 64, p('A river that built a town'), { font: '@heading', size: 26, lineHeight: 1.1 }, { name: 'Article heading' }),
      a1
    ]],
    [[picture(X, 72, W, 236, { name: 'Mill photo' }), caption(314, 'The grain mill in 1902, three years before the new sluice gates were fitted.'), a2]],
    [[
      a3,
      hline(X, 424, W, '@accent', 1.25, { name: 'Quote rule top' }),
      text(doc, X + 24, 440, W - 48, 140, p('“Wheel stuck again. Father cross. Lambs born at Hale’s.”'),
        { font: '@heading', italic: true, size: 22, color: '@accent', align: 'center', lineHeight: 1.25 }, { name: 'Pull quote', valign: 'middle' }),
      text(doc, X, 588, W, 18, p('— From the diary of Abigail Thorne, aged nine'), { size: 8.5, caps: true, letterSpacing: 2, color: '@muted', align: 'center' }, { name: 'Quote credit' }),
      hline(X, 624, W, '@accent', 1.25, { name: 'Quote rule bottom' }),
      picture(X, 648, W, 112, { name: 'Detail photo' })
    ]],
    [[a4, picture(X, 316, W, 400, { name: 'Weir photo' }), caption(722, 'The weir at the upper pond, where the trail ends.')]],
    [[
      text(doc, X, 72, W, 22, p('Along the way'), { size: 9.5, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
      text(doc, X, 98, W, 40, p('Trail stops'), { font: '@heading', size: 26, lineHeight: 1.1 }, { name: 'Heading' }),
      table(X, 152, W, 448, [
        ['<b>Stop</b>', '<b>Mile</b>', '<b>What to look for</b>'],
        ['1', '0.0', 'Upper pond and the site of the first dam'],
        ['2', '0.2', 'Mason’s marks on the mill race wall'],
        ['3', '0.5', 'Heron colony in the alders'],
        ['4', '0.8', 'The second footbridge and sluice gate'],
        ['5', '1.1', 'Picnic meadow and the iron wheel'],
        ['6', '1.4', 'Foundations of the timber mill'],
        ['7', '1.7', 'Flood marker from 1869'],
        ['8', '2.0', 'The restored grain mill']
      ], { colWeights: [0.6, 0.6, 3.4], header: true, banded: true, style: { size: 10 }, name: 'Trail stops table', headerFill: '@accent', headerColor: 'paper',
        cellProps: (r, c) => ({ align: c < 2 ? 'center' : 'left' }) }),
      text(doc, X, 624, W, 120, p('Distances are measured from the car park at the upper pond. The return walk along the lane is a little shorter, about one and a half miles.'),
        { italic: true, size: 10, color: '@muted', lineHeight: 1.5 }, { name: 'Note' })
    ]],
    [[
      text(doc, X, 72, W, 40, p('About the Society'), { font: '@heading', size: 24, color: '@accent' }, { name: 'About heading' }),
      text(doc, X, 124, W, 280, p('The Millbrook Historical Society cares for the grain mill, the trail and the town archive. We are run entirely by volunteers and funded by members and visitors like you.') +
        p('<b>Visit</b> · The Mill, River Lane, Millbrook<br><b>Write</b> · hello@millbrookhistory.example<br><b>Call</b> · (555) 014 6610'),
        { size: 10.5, lineHeight: 1.55, spaceAfter: 8 }, { name: 'About the society' }),
      text(doc, X, 432, W, 40, p('Notes'), { font: '@heading', size: 24, color: '@accent' }, { name: 'Notes heading' }),
      ...notesLines,
      text(doc, X, 748, W, 16, p('© Millbrook Historical Society · Printed on recycled paper'), { size: 8, color: '@muted', align: 'center' }, { name: 'Imprint' })
    ], { masterId: null }]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Newsletters
// ---------------------------------------------------------------------------------------------

const LEDGER_STORY = [
  'As the first frost settles over the beds, there is a particular satisfaction in the slow work of autumn. Seed heads are left standing for the finches; tender bulbs are lifted, dried and wrapped in newspaper; the last of the dahlias are cut for the kitchen table.',
  'We spoke with three of our longest-serving plot holders about the rituals that carry their gardens through the dark months — and the small habits that make spring arrive a little sooner.',
  '“Leave the borders a little untidy,” says Ruth Okafor, who has kept plot 14 for thirty-one years. “The insects need somewhere to sleep, and frankly so do I.” Her advice: mulch generously, label everything, and resist the urge to prune until February.',
  'Two plots along, Dev Malhotra spends October building leaf bins from old pallets. “Leaves are free fertiliser,” he says. “Give them two winters and you have the best soil conditioner money can’t buy.” He stacks them damp, covers the bins with old carpet and forgets about them until the spring after next.',
  'For newer members, the most common question is what to do with an empty bed. The answer, almost everyone agrees, is not to leave it bare. A sowing of field beans or winter rye protects the soil from heavy rain and can be dug in as green manure in March.',
  'Fruit trees need a little attention before the ground freezes. Clear grass from around the trunks, add a ring of well-rotted manure and check tree ties for rubbing. Grease bands fixed now will catch winter moths as they climb to lay their eggs.',
  'Over in the long beds, Ruth’s neighbour Joseph Brandt swears by cardboard. “Flatten your boxes, peel off the tape, lay them over the weeds and pile compost on top,” he says. “By April the worms have done the digging for you.” He has not turned his soil with a spade in nine years, and his leeks are the envy of the site.',
  'Perennial herbs appreciate a light trim, but leave the woody stems of sage, thyme and lavender until spring; cutting them hard now invites frost damage. Pot up a clump of chives or parsley for the kitchen windowsill and you will have fresh leaves well into the new year.',
  'If you grow under cover, now is the time to wash down the glass, open the vents on mild days and sow hardy salads for winter picking. Mizuna, winter purslane and lamb’s lettuce will crop steadily from November to March with nothing more than a fleece on cold nights.',
  'Most of all, our members agree, autumn is a time to sit back and take stock. Note what thrived and what failed, order seed while the memory is fresh, and enjoy the quiet. The garden is not finished; it is only resting.',
  'Finally, a plea from the committee: please return borrowed tools to the shed before the clocks change. Last year three spades spent the winter in a hedge.'
];

function newsletter4() {
  const doc = newDoc({ title: 'The Garden Ledger', size: 'letter', schemeId: 'sage', fontSchemeId: 'editorial',
    margins: { top: 72, right: 56, bottom: 56, left: 56 }, columns: { count: 3, gutter: 20 }, category: 'newsletters' });
  const masterA = doc.masters[0];
  masterA.elements.push(
    text(doc, 56, 30, 500, 16, p('The Garden Ledger · Autumn 2026'), { size: 8, caps: true, letterSpacing: 2, color: '@muted' }, { name: 'Running header' }),
    text(doc, 560, 30, 200, 16, p(`Page ${field('#page')}`), { size: 8, caps: true, letterSpacing: 2, color: '@muted', align: 'right' }, { name: 'Page number' }),
    hline(56, 52, 704, '@ink', 0.75, { name: 'Header rule' })
  );
  const cover = addMaster(doc, 'Cover');
  const body = { size: 10, lineHeight: 1.5, align: 'justify', spaceAfter: 6 };
  const s1 = text(doc, 56, 612, 470, 384, LEDGER_STORY.map((t) => p(t)).join(''), body, { name: 'Lead story (1 of 2)', columns: 2, colGap: 18 });
  const s2 = text(doc, 56, 104, 460, 412, '', body, { name: 'Lead story (2 of 2)', columns: 2, colGap: 18 });
  linkFrames(doc, [s1, s2]);
  const kicker = (x, y, w, t) => text(doc, x, y, w, 16, p(t), { size: 8.5, caps: true, letterSpacing: 2.5, color: '@accent' }, { name: 'Kicker' });
  const toc = table(560, 566, 186, 140, [
    ['Bedding down for winter', '1'], ['Seed swap returns', '2'], ['Recipes from the plot', '3'], ['Member spotlight', '3'], ['Dates for the diary', '4']
  ], { colWeights: [5, 1], name: 'Table of contents', border: { color: '@muted', width: 0 }, style: { size: 9.5 },
    cellProps: (r, c) => ({ align: c === 1 ? 'right' : 'left', padding: 3, borders: { top: null, left: null, right: null, bottom: { color: '@muted', width: 0.5, dash: 'dot' } } }) });
  const recipe = (x, title, ingredients, method) => [
    picture(x, 150, 340, 240, { name: `${title} photo` }),
    text(doc, x, 402, 340, 30, p(title), { font: '@heading', size: 17 }, { name: `${title} title` }),
    text(doc, x, 438, 340, 236, p(span('You will need', `${css.accent}; text-transform: uppercase; letter-spacing: 1.5px; font-size: 8.5pt`), 'margin-bottom: 2px') +
      `<ul>${ingredients.map((i) => `<li>${i}</li>`).join('')}</ul>` + p(method, 'margin-top: 6px'), { size: 9.5, lineHeight: 1.45 }, { name: `${title} recipe` })
  ];
  const diary = table(56, 104, 704, 300, [
    ['<b>Date</b>', '<b>Event</b>', '<b>Where</b>'],
    ['Sat 17 Oct', 'Leaf-bin building workshop', 'Plot 22 and the tool shed'],
    ['Sun 25 Oct', 'Seed swap and soup lunch', 'The Old Schoolhouse'],
    ['Sat 7 Nov', 'Fruit tree pruning demonstration', 'Community orchard'],
    ['Thu 19 Nov', 'Annual general meeting', 'St. Anne’s church hall'],
    ['Sat 5 Dec', 'Wreath making and mulled apple juice', 'The pavilion'],
    ['Sat 16 Jan', 'Seed catalogue evening', 'The Old Schoolhouse']
  ], { colWeights: [1.2, 3, 2.4], header: true, banded: true, name: 'Events table', style: { size: 10 }, headerFill: '@accent', headerColor: 'paper',
    cellProps: () => ({ padding: 6 }) });
  const addr = `${field('Name')}<br>${field('Address')}<br>${field('City')}, ${field('State')} ${field('ZIP')}`;
  return setPages(doc, [
    [[
      text(doc, 56, 30, 704, 96, p('The Garden Ledger'), { font: '@heading', size: 52, align: 'center', lineHeight: 1.1 }, { name: 'Masthead' }),
      hline(56, 128, 704, '@ink', 2, { name: 'Masthead rule' }),
      text(doc, 56, 136, 704, 20, p('Volume IV · No. 3 · Autumn 2026 · Eastside Allotment Association'),
        { size: 8.5, caps: true, letterSpacing: 2, color: '@muted', align: 'center' }, { name: 'Dateline', valign: 'middle' }),
      hline(56, 162, 704, '@ink', 0.75, { name: 'Dateline rule' }),
      picture(56, 180, 704, 282, { name: 'Lead photo' }),
      text(doc, 56, 468, 704, 18, p('Plot 14 in late October, mulched and ready for winter. Photograph by Tom Avery.'), { italic: true, size: 9, color: '@muted' }, { name: 'Caption' }),
      text(doc, 56, 500, 470, 80, p('The Quiet Art of Putting a Garden to Bed'), { font: '@heading', size: 25, lineHeight: 1.12 }, { name: 'Headline' }),
      text(doc, 56, 584, 470, 18, p('By Margaret Ellis'), { italic: true, size: 10.5, color: '@accent' }, { name: 'Byline' }),
      s1,
      rect(546, 500, 214, 496, '@light', { name: 'Sidebar' }),
      kicker(560, 514, 186, 'Inside'),
      text(doc, 560, 532, 186, 28, p('In this issue'), { font: '@heading', size: 15 }, { name: 'Contents heading' }),
      toc,
      hline(560, 728, 186, '@accent2', 1, { name: 'Sidebar rule' }),
      kicker(560, 744, 186, 'Reminder'),
      text(doc, 560, 764, 186, 220, p('Plot rents for 2027 are due by 30 November. Pay at the pavilion on Saturday mornings or by bank transfer — details on page four.') +
        p('<b>Water troughs</b> will be drained on 1 November to protect the pipes from frost.'), { size: 9.5, lineHeight: 1.45, spaceAfter: 6 }, { name: 'Sidebar notes' }),
      text(doc, 56, 1018, 704, 16, p('gardenledger.example · Members receive the Ledger free each quarter'), { size: 8.5, color: '@muted', align: 'center' }, { name: 'Footer' })
    ], { masterId: cover.id }],
    [[
      text(doc, 56, 76, 460, 18, p('Putting a garden to bed, continued from page 1'), { italic: true, size: 10, color: '@accent' }, { name: 'Continued' }),
      s2,
      picture(536, 104, 224, 300, { name: 'Leaf bin photo' }),
      text(doc, 536, 410, 224, 40, p('Dev Malhotra’s pallet leaf bins: two winters to perfect leaf mould.'), { italic: true, size: 9, color: '@muted', lineHeight: 1.35 }, { name: 'Caption' }),
      hline(56, 536, 704, '@ink', 0.75, { name: 'Section rule' }),
      kicker(56, 552, 704, 'Community'),
      text(doc, 56, 572, 704, 40, p('Seed Swap Returns to the Old Schoolhouse'), { font: '@heading', size: 22 }, { name: 'Headline' }),
      text(doc, 56, 620, 704, 210, p('After two years away, the autumn seed swap is back. Bring your saved seed in labelled envelopes — beans, tomatoes, calendula and anything that grew well for you — and take home something new to try. Our seed librarian, Hannah Cole, will be on hand to help with storage and germination tests.') +
        p('Soup and bread will be served from noon, made with produce donated by members. Children are welcome; there will be a sunflower-planting table and a prize for the tallest seedling in June.') +
        p('If you cannot attend but have seed to share, leave it in the box marked “Swap” in the pavilion before the 23rd.'),
        { size: 10, lineHeight: 1.5, align: 'justify', spaceAfter: 6 }, { name: 'Seed swap story', columns: 3, colGap: 20 }),
      hline(56, 858, 704, '@accent', 1.5, { name: 'Quote rule top' }),
      text(doc, 96, 876, 624, 84, p('“The insects need somewhere to sleep, and frankly so do I.”'), { font: '@heading', italic: true, size: 22, color: '@accent', align: 'center', lineHeight: 1.25 }, { name: 'Pull quote', valign: 'middle' }),
      text(doc, 96, 964, 624, 18, p('— Ruth Okafor, plot 14'), { size: 9.5, caps: true, letterSpacing: 2, color: '@muted', align: 'center' }, { name: 'Quote credit' }),
      hline(56, 996, 704, '@accent', 1.5, { name: 'Quote rule bottom' })
    ]],
    [[
      kicker(56, 76, 704, 'From the kitchen'),
      text(doc, 56, 94, 704, 46, p('Recipes from the Plot'), { font: '@heading', size: 26 }, { name: 'Headline' }),
      ...recipe(56, 'Roast squash &amp; sage soup', ['1 medium squash, peeled and cubed', '2 onions, sliced', 'A handful of sage leaves', '1 litre vegetable stock', 'Olive oil, salt and pepper'],
        'Roast the squash and onions at 200 °C for 35 minutes. Fry the sage until crisp. Blend the vegetables with the stock, season, and serve topped with the sage.'),
      ...recipe(420, 'Windfall apple crumble', ['6 cooking apples, cored and sliced', '2 tbsp brown sugar', '150 g flour', '100 g cold butter', '75 g oats'],
        'Toss the apples with the sugar in a dish. Rub the butter into the flour, stir in the oats and scatter over the fruit. Bake at 180 °C for 40 minutes.'),
      hline(56, 700, 704, '@ink', 0.75, { name: 'Section rule' }),
      kicker(56, 716, 704, 'Member spotlight'),
      text(doc, 56, 736, 704, 36, p('Five Questions for Amara Lewis'), { font: '@heading', size: 20 }, { name: 'Spotlight headline' }),
      picture(56, 784, 150, 190, { name: 'Member portrait' }),
      text(doc, 226, 784, 534, 200, p('<b>How long have you had your plot?</b> Six years this spring. I started with a quarter plot and kept asking for more.') +
        p('<b>Best crop this year?</b> Borlotti beans. Beautiful pods, and they dry perfectly on the shed roof.') +
        p('<b>Biggest mistake?</b> Planting mint straight into the ground. Never again.') +
        p('<b>Advice for beginners?</b> Grow what you love to eat, and talk to your neighbours.'),
        { size: 9.5, lineHeight: 1.45, spaceAfter: 5, align: 'justify' }, { name: 'Spotlight interview', columns: 2, colGap: 18 })
    ]],
    [[
      kicker(56, 76, 704, 'Dates for the diary'),
      diary,
      rect(56, 436, 344, 300, '@light', { name: 'Join panel' }),
      text(doc, 76, 456, 304, 260, p(span('Join the association', `${css.heading}; font-size: 17pt; ${css.accent}`), 'margin-bottom: 8px') +
        p('Membership is $12 a year and includes the Ledger, discounts at the trading hut and a vote at the AGM.', 'margin-bottom: 8px') +
        p('Plot rents for 2027 are due by 30 November. Pay at the pavilion on Saturday mornings, 9 to 11, or by transfer to account 0042 1187, reference your plot number.'),
        { size: 10, lineHeight: 1.5 }, { name: 'Join text' }),
      text(doc, 420, 436, 340, 300, p(span('Committee', `${css.heading}; font-size: 17pt; ${css.accent}`), 'margin-bottom: 8px') +
        p('<b>Chair</b> · Margaret Ellis') + p('<b>Secretary</b> · Joseph Brandt') + p('<b>Treasurer</b> · Priya Natarajan') + p('<b>Seed librarian</b> · Hannah Cole') +
        p('Write to us at hello@gardenledger.example', 'margin-top: 8px'),
        { size: 10, lineHeight: 1.6 }, { name: 'Committee' }),
      hline(56, 770, 704, '@muted', 0.75, { name: 'Mailing rule', dash: 'dash' }),
      text(doc, 56, 794, 300, 80, p('Eastside Allotment Association<br>The Pavilion, Mill Lane<br>Ashford, CT 06278'), { size: 9.5, lineHeight: 1.45, color: '@muted' }, { name: 'Return address' }),
      outline(680, 794, 80, 96, '@muted', 1, { name: 'Stamp box' }),
      text(doc, 380, 900, 380, 100, p(addr), { size: 12, lineHeight: 1.45 }, { name: 'Recipient address', valign: 'middle' })
    ]]
  ]);
}

function bulletin() {
  const doc = newDoc({ title: 'Northgate School Bulletin', size: 'letter', schemeId: 'harbor', fontSchemeId: 'modern',
    margins: 56, columns: { count: 2, gutter: 24 }, category: 'newsletters' });
  const sec = (x, y, w, kick, head) => [
    text(doc, x, y, w, 16, p(kick), { size: 8.5, caps: true, letterSpacing: 2.5, color: '@accent' }, { name: 'Kicker' }),
    text(doc, x, y + 20, w, 32, p(head), { font: '@heading', size: 19, lineHeight: 1.15 }, { name: 'Heading' })
  ];
  const body = { size: 10, lineHeight: 1.5, spaceAfter: 6 };
  return setPages(doc, [[[
    rect(0, 0, 816, 168, '@accent', { name: 'Masthead band' }),
    text(doc, 56, 40, 520, 70, p('Northgate Bulletin'), { font: '@heading', size: 42, color: '@paper', lineHeight: 1.05 }, { name: 'Masthead' }),
    text(doc, 56, 112, 520, 20, p('News for families · Northgate Elementary School'), { size: 10, caps: true, letterSpacing: 2.5, color: '@accent2' }, { name: 'Tagline' }),
    text(doc, 560, 52, 200, 70, p(span('Issue 7', `${css.heading}; font-size: 20pt`)) + p('October 2026'), { size: 10.5, color: '@paper', align: 'right', lineHeight: 1.3 }, { name: 'Issue' }),
    ...sec(56, 196, 452, 'From the principal', 'A Strong Start to the Year'),
    picture(56, 256, 452, 230, { name: 'Lead photo' }),
    text(doc, 56, 500, 452, 300, p('What a wonderful first six weeks. Our new reading garden opened on schedule thanks to forty parent volunteers who gave up a rainy Saturday to lay paths and plant bulbs.') +
      p('This month we welcome Ms. Farah Qureshi to the fourth-grade team and say a fond farewell to Mr. Daniel Ortiz, who retires after twenty-six years of teaching science with unforgettable enthusiasm.') +
      p('Please remember that school photographs are on 21 October. Order forms went home in book bags last week; spare copies are at the front office.') +
      p('— Dr. Helen Park, Principal'), { ...body, size: 10.5 }, { name: 'Principal letter' }),
    hline(56, 820, 452, '@light', 1.5, { name: 'Rule' }),
    ...sec(56, 836, 452, 'Celebrating', 'Stars of the Month'),
    text(doc, 56, 894, 452, 120, p('Congratulations to <b>Maya R.</b> (kindness), <b>Leo T.</b> (perseverance), <b>Aisha K.</b> (curiosity) and <b>Sam W.</b> (teamwork), nominated by their classmates and teachers.'),
      body, { name: 'Stars' }),
    rect(532, 196, 228, 818, '@light', { name: 'Sidebar' }),
    text(doc, 552, 216, 188, 30, p('Coming up'), { font: '@heading', size: 19, color: '@accent' }, { name: 'Sidebar heading' }),
    table(552, 256, 188, 330, [
      ['<b>Oct 14</b>', 'Book fair opens'], ['<b>Oct 21</b>', 'School photographs'], ['<b>Oct 23</b>', 'Early dismissal, 1 pm'],
      ['<b>Oct 30</b>', 'Harvest parade'], ['<b>Nov 4</b>', 'Parent conferences'], ['<b>Nov 11</b>', 'No school']
    ], { colWeights: [1, 1.8], name: 'Dates table', border: { color: '@muted', width: 0 }, style: { size: 9.5 },
      cellProps: () => ({ padding: 4, valign: 'top', borders: { top: null, left: null, right: null, bottom: { color: '@muted', width: 0.5, dash: 'solid' } } }) }),
    text(doc, 552, 612, 188, 24, p('Lunch menu'), { font: '@heading', size: 15, color: '@accent' }, { name: 'Lunch heading' }),
    text(doc, 552, 642, 188, 150, p('Menus rotate every two weeks and are posted on the parent portal. Vegetarian and allergy-friendly options are available every day.'),
      { size: 9.5, lineHeight: 1.45 }, { name: 'Lunch text' }),
    text(doc, 552, 820, 188, 24, p('Contact us'), { font: '@heading', size: 15, color: '@accent' }, { name: 'Contact heading' }),
    text(doc, 552, 850, 188, 140, p('Front office<br>(555) 014 2200<br>office@northgate.example') + p('Absence line<br>(555) 014 2201', 'margin-top: 6px'),
      { size: 9.5, lineHeight: 1.45 }, { name: 'Contact' })
  ]]]);
}

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: Function}>} */
export const PRINT_TEMPLATES = [
  { id: 'event-flyer', name: 'Event Flyer', category: 'flyers', description: 'Elegant typographic flyer for a concert, gala or evening event.', sizeLabel: 'Letter · 8.5 × 11 in', build: eventFlyer },
  { id: 'sale-flyer', name: 'Sale Flyer', category: 'flyers', description: 'Bold retail flyer with a starburst offer, product photo and cut-out coupon.', sizeLabel: 'Letter · 8.5 × 11 in', build: saleFlyer },
  { id: 'tear-off-flyer', name: 'Tear-off Flyer', category: 'flyers', description: 'Notice-board flyer with phone-number tear-off strips along the bottom.', sizeLabel: 'Letter · 8.5 × 11 in', build: tearOffFlyer },
  { id: 'lecture-poster', name: 'Lecture Poster', category: 'posters', description: 'Large-type poster for a talk or lecture series with a full programme.', sizeLabel: 'Tabloid · 11 × 17 in', build: lecturePoster },
  { id: 'concert-poster', name: 'Concert Poster', category: 'posters', description: 'Dramatic concert poster with a circular performer photo.', sizeLabel: 'Poster · 18 × 24 in', build: concertPoster },
  { id: 'trifold-brochure', name: 'Tri-fold Brochure', category: 'brochures', description: 'Two-sided, three-panel brochure with cover, map, membership and programme panels.', sizeLabel: 'Letter landscape · 3 panels', build: trifoldBrochure },
  { id: 'booklet-pamphlet', name: 'Booklet Pamphlet', category: 'brochures', description: 'Eight-page half-letter booklet with master page header and page numbers and an article flowing through linked text boxes.', sizeLabel: 'Half Letter · 8 pages', build: pamphletBooklet },
  { id: 'newsletter-4page', name: 'Quarterly Newsletter', category: 'newsletters', description: 'Four-page newsletter with masthead, linked lead story, contents sidebar, recipes, events table and mailing panel.', sizeLabel: 'Letter · 4 pages', build: newsletter4 },
  { id: 'newsletter-bulletin', name: 'School Bulletin', category: 'newsletters', description: 'One-page bulletin with a colour masthead, two-column story and a dates sidebar.', sizeLabel: 'Letter · 1 page', build: bulletin }
];
