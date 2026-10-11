// The 85 proofing languages: code, English and native names, writing direction and the spelling
// dictionaries (variants) for each. Proofing ids are the dictionary ids ('en-US', 'fr', 'sr-Latn' …);
// text carries one in frame.lang, and the document default in doc.meta.lang.
// Dictionary files are built into app/dict by scripts/dictionaries.mjs.

const LO = (id, file, dir) => ({ id, src: 'lo', aff: `${dir}/${file}.aff`, dic: `${dir}/${file}.dic` });
const WO = (id, code) => ({ id, src: 'wooorm', aff: `dictionaries/${code}/index.aff`, dic: `dictionaries/${code}/index.dic` });
const FQ = (id, code, script) => ({ id, src: 'freq', path: `content/2018/${code}/${code}_full.txt`, script });

// code | English name | native name | dictionaries (first = default)
const TABLE = [
  ['af', 'Afrikaans', 'Afrikaans', [LO('af', 'af_ZA', 'af_ZA')]],
  ['an', 'Aragonese', 'Aragonés', [LO('an', 'an_ES', 'an_ES')]],
  ['ar', 'Arabic', 'العربية', [LO('ar', 'ar', 'ar')], 'rtl'],
  ['as', 'Assamese', 'অসমীয়া', [LO('as', 'as_IN', 'as_IN')]],
  ['be', 'Belarusian', 'Беларуская', [LO('be', 'be-official', 'be_BY')]],
  ['bg', 'Bulgarian', 'Български', [LO('bg', 'bg_BG', 'bg_BG')]],
  ['bn', 'Bengali', 'বাংলা', [LO('bn', 'bn_BD', 'bn_BD')]],
  ['bo', 'Tibetan', 'བོད་ཡིག', [LO('bo', 'bo', 'bo')]],
  ['br', 'Breton', 'Brezhoneg', [LO('br', 'br_FR', 'br_FR')]],
  ['bs', 'Bosnian', 'Bosanski', [LO('bs', 'bs_BA', 'bs_BA')]],
  ['ca', 'Catalan', 'Català', [LO('ca', 'ca', 'ca/dictionaries'), LO('ca-valencia', 'ca-valencia', 'ca/dictionaries')]],
  ['cs', 'Czech', 'Čeština', [LO('cs', 'cs_CZ', 'cs_CZ')]],
  ['cy', 'Welsh', 'Cymraeg', [WO('cy', 'cy')]],
  ['da', 'Danish', 'Dansk', [LO('da', 'da_DK', 'da_DK')]],
  ['de', 'German', 'Deutsch', [LO('de-DE', 'de_DE_frami', 'de'), LO('de-AT', 'de_AT_frami', 'de'), LO('de-CH', 'de_CH_frami', 'de')]],
  ['el', 'Greek', 'Ελληνικά', [LO('el', 'el_GR', 'el_GR')]],
  ['en', 'English', 'English', [LO('en-US', 'en_US', 'en'), LO('en-GB', 'en_GB', 'en'), LO('en-AU', 'en_AU', 'en'), LO('en-CA', 'en_CA', 'en'), LO('en-ZA', 'en_ZA', 'en')]],
  ['eo', 'Esperanto', 'Esperanto', [LO('eo', 'eo', 'eo')]],
  ['es', 'Spanish', 'Español', [LO('es-ES', 'es_ES', 'es'), LO('es-MX', 'es_MX', 'es'), LO('es-AR', 'es_AR', 'es'), LO('es-US', 'es_US', 'es')]],
  ['et', 'Estonian', 'Eesti', [LO('et', 'et_EE', 'et_EE')]],
  ['eu', 'Basque', 'Euskara', [WO('eu', 'eu')]],
  ['fa', 'Persian', 'فارسی', [LO('fa', 'fa-IR', 'fa_IR')], 'rtl'],
  ['fi', 'Finnish', 'Suomi', [FQ('fi', 'fi', 'Latin')]],
  ['fo', 'Faroese', 'Føroyskt', [WO('fo', 'fo')]],
  ['fr', 'French', 'Français', [LO('fr', 'fr', 'fr_FR/dictionaries')]],
  ['fur', 'Friulian', 'Furlan', [WO('fur', 'fur')]],
  ['fy', 'Western Frisian', 'Frysk', [WO('fy', 'fy')]],
  ['ga', 'Irish', 'Gaeilge', [WO('ga', 'ga')]],
  ['gd', 'Scottish Gaelic', 'Gàidhlig', [LO('gd', 'gd_GB', 'gd_GB')]],
  ['gl', 'Galician', 'Galego', [LO('gl', 'gl_ES', 'gl')]],
  ['gu', 'Gujarati', 'ગુજરાતી', [LO('gu', 'gu_IN', 'gu_IN')]],
  ['gug', 'Guarani', 'Avañeʼẽ', [LO('gug', 'gug', 'gug')]],
  ['he', 'Hebrew', 'עברית', [LO('he', 'he_IL', 'he_IL')], 'rtl'],
  ['hi', 'Hindi', 'हिन्दी', [LO('hi', 'hi_IN', 'hi_IN')]],
  ['hr', 'Croatian', 'Hrvatski', [LO('hr', 'hr_HR', 'hr_HR')]],
  ['hu', 'Hungarian', 'Magyar', [LO('hu', 'hu_HU', 'hu_HU')]],
  ['hy', 'Armenian', 'Հայերեն', [WO('hy', 'hy')]],
  ['ia', 'Interlingua', 'Interlingua', [WO('ia', 'ia')]],
  ['id', 'Indonesian', 'Bahasa Indonesia', [LO('id', 'id_ID', 'id')]],
  ['is', 'Icelandic', 'Íslenska', [LO('is', 'is', 'is')]],
  ['it', 'Italian', 'Italiano', [LO('it', 'it_IT', 'it_IT')]],
  ['ka', 'Georgian', 'ქართული', [WO('ka', 'ka')]],
  ['kk', 'Kazakh', 'Қазақ тілі', [FQ('kk', 'kk', 'Cyrillic')]],
  ['kmr', 'Kurmanji Kurdish', 'Kurmancî', [LO('kmr', 'kmr_Latn', 'kmr_Latn')]],
  ['kn', 'Kannada', 'ಕನ್ನಡ', [LO('kn', 'kn_IN', 'kn_IN')]],
  ['ko', 'Korean', '한국어', [LO('ko', 'ko_KR', 'ko_KR')]],
  ['la', 'Latin', 'Latina', [WO('la', 'la')]],
  ['lb', 'Luxembourgish', 'Lëtzebuergesch', [WO('lb', 'lb')]],
  ['lo', 'Lao', 'ລາວ', [LO('lo', 'lo_LA', 'lo_LA')]],
  ['lt', 'Lithuanian', 'Lietuvių', [LO('lt', 'lt', 'lt_LT')]],
  ['lv', 'Latvian', 'Latviešu', [LO('lv', 'lv_LV', 'lv_LV')]],
  ['mk', 'Macedonian', 'Македонски', [WO('mk', 'mk')]],
  ['ml', 'Malayalam', 'മലയാളം', [FQ('ml', 'ml', 'Malayalam')]],
  ['mn', 'Mongolian', 'Монгол', [LO('mn', 'mn_MN', 'mn_MN')]],
  ['mr', 'Marathi', 'मराठी', [LO('mr', 'mr_IN', 'mr_IN')]],
  ['ms', 'Malay', 'Bahasa Melayu', [{ id: 'ms', src: 'tito', aff: 'Malays.aff', dic: 'Malays.dic' }]],
  ['nb', 'Norwegian Bokmål', 'Norsk bokmål', [LO('nb', 'nb_NO', 'no')]],
  ['nds', 'Low German', 'Plattdüütsch', [WO('nds', 'nds')]],
  ['ne', 'Nepali', 'नेपाली', [LO('ne', 'ne_NP', 'ne_NP')]],
  ['nl', 'Dutch', 'Nederlands', [LO('nl', 'nl_NL', 'nl_NL')]],
  ['nn', 'Norwegian Nynorsk', 'Norsk nynorsk', [LO('nn', 'nn_NO', 'no')]],
  ['oc', 'Occitan', 'Occitan', [LO('oc', 'oc_FR', 'oc_FR')]],
  ['or', 'Odia', 'ଓଡ଼ିଆ', [LO('or', 'or_IN', 'or_IN')]],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ', [LO('pa', 'pa_IN', 'pa_IN')]],
  ['pl', 'Polish', 'Polski', [LO('pl', 'pl_PL', 'pl_PL')]],
  ['pt', 'Portuguese', 'Português', [LO('pt-BR', 'pt_BR', 'pt_BR'), LO('pt-PT', 'pt_PT', 'pt_PT')]],
  ['ro', 'Romanian', 'Română', [LO('ro', 'ro_RO', 'ro')]],
  ['ru', 'Russian', 'Русский', [LO('ru', 'ru_RU', 'ru_RU')]],
  ['sa', 'Sanskrit', 'संस्कृतम्', [LO('sa', 'sa_IN', 'sa_IN')]],
  ['si', 'Sinhala', 'සිංහල', [LO('si', 'si_LK', 'si_LK')]],
  ['sk', 'Slovak', 'Slovenčina', [LO('sk', 'sk_SK', 'sk_SK')]],
  ['sl', 'Slovenian', 'Slovenščina', [LO('sl', 'sl_SI', 'sl_SI')]],
  ['sq', 'Albanian', 'Shqip', [LO('sq', 'sq_AL', 'sq_AL')]],
  ['sr', 'Serbian', 'Српски', [LO('sr', 'sr', 'sr'), LO('sr-Latn', 'sr-Latn', 'sr')]],
  ['sv', 'Swedish', 'Svenska', [LO('sv', 'sv_SE', 'sv_SE/dictionaries'), LO('sv-FI', 'sv_FI', 'sv_SE/dictionaries')]],
  ['sw', 'Swahili', 'Kiswahili', [LO('sw', 'sw_TZ', 'sw_TZ')]],
  ['ta', 'Tamil', 'தமிழ்', [LO('ta', 'ta_IN', 'ta_IN')]],
  ['te', 'Telugu', 'తెలుగు', [LO('te', 'te_IN', 'te_IN')]],
  ['th', 'Thai', 'ไทย', [LO('th', 'th_TH', 'th_TH')]],
  ['tk', 'Turkmen', 'Türkmençe', [WO('tk', 'tk')]],
  ['tl', 'Filipino', 'Filipino', [FQ('tl', 'tl', 'Latin')]],
  ['tr', 'Turkish', 'Türkçe', [LO('tr', 'tr_TR', 'tr_TR')]],
  ['uk', 'Ukrainian', 'Українська', [LO('uk', 'uk_UA', 'uk_UA')]],
  ['ur', 'Urdu', 'اردو', [FQ('ur', 'ur', 'Arabic')], 'rtl'],
  ['vi', 'Vietnamese', 'Tiếng Việt', [LO('vi', 'vi_VN', 'vi')]]
];

const VARIANT_NAMES = {
  'en-US': 'United States', 'en-GB': 'United Kingdom', 'en-AU': 'Australia', 'en-CA': 'Canada', 'en-ZA': 'South Africa',
  'de-DE': 'Germany', 'de-AT': 'Austria', 'de-CH': 'Switzerland', 'pt-BR': 'Brazil', 'pt-PT': 'Portugal',
  'es-ES': 'Spain', 'es-MX': 'Mexico', 'es-AR': 'Argentina', 'es-US': 'United States', 'sr-Latn': 'Latin', sr: 'Cyrillic',
  'ca-valencia': 'Valencian', 'sv-FI': 'Finland'
};

/** Words in these scripts are not separated by spaces: split them with Intl.Segmenter. */
export const SEGMENTED = new Set(['th', 'lo', 'bo']);

/** The 85 proofing languages. */
export const LANGUAGES = TABLE.map(([code, name, native, dicts, dir]) => ({ code, name, native, dir: dir || 'ltr', dicts, dict: dicts[0].id }));

/** Every proofing choice (language variants included): { id, code, label, native, dir }. */
export const PROOFING = LANGUAGES.flatMap((l) => l.dicts.map((d) => ({
  id: d.id, code: l.code, dir: l.dir, native: l.native,
  label: l.dicts.length > 1 || VARIANT_NAMES[d.id] ? `${l.name} (${VARIANT_NAMES[d.id] || d.id})` : l.name
}))).sort((a, b) => a.label.localeCompare(b.label));

const byId = new Map(PROOFING.map((p) => [p.id, p]));

/** Proofing entry for an id, or null. */
export function proofing(id) { return byId.get(id) || null; }

/** Best proofing id for a BCP 47 tag (e.g. navigator.language), default 'en-US'. */
export function matchLanguage(tag) {
  const t = String(tag || '').replace('_', '-');
  if (byId.has(t)) return t;
  const lower = t.toLowerCase();
  for (const id of byId.keys()) if (id.toLowerCase() === lower) return id;
  const base = lower.split('-')[0];
  if (base === 'zh' || !base) return 'en-US';
  const lang = LANGUAGES.find((l) => l.code === base || (base === 'no' && l.code === 'nb') || (base === 'fil' && l.code === 'tl'));
  return lang ? lang.dict : 'en-US';
}
