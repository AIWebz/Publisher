// Turns a translation of the interface strings into a display-language catalog, and reports how
// complete the catalogs are.
//
//   node scripts/i18n-import.mjs <code> <file> [list]   import: write app/i18n/<code>.json
//                                                       (list: the numbered English list the file follows)
//   node scripts/i18n-import.mjs --check         coverage of every catalog against strings.json
//
// <file> has one line per string: "<number>\t<translation>", numbered from 1 in the order of
// app/i18n/strings.json (written by i18n-extract.mjs); "\n" in a translation is a line break.
// A translation is kept only if it uses exactly the placeholders of its English string ({1}, {n} …).
// app/i18n/index.json (the list of display languages) is rewritten from the catalogs present.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'app/i18n');
// the numbering the translation used: strings.json, or a frozen numbered list ("<n><TAB><English>")
const listFile = process.argv[4];
const keys = listFile
  ? readFileSync(listFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.slice(l.indexOf('\t') + 1).replace(/\\n/g, '\n'))
  : JSON.parse(readFileSync(path.join(dir, 'strings.json'), 'utf8'));
const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');

function writeIndex() {
  const codes = readdirSync(dir).filter((f) => f.endsWith('.json') && !['strings.json', 'index.json'].includes(f)).map((f) => f.slice(0, -5)).sort();
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify(codes) + '\n');
  return codes;
}

const [a, b] = process.argv.slice(2);
if (a === '--check') {
  for (const code of writeIndex()) {
    const cat = JSON.parse(readFileSync(path.join(dir, `${code}.json`), 'utf8'));
    const have = keys.filter((k) => typeof cat[k] === 'string' && cat[k]).length;
    const bad = Object.entries(cat).filter(([k, v]) => holes(k) !== holes(v)).length;
    console.log(`${code.padEnd(8)} ${String(have).padStart(5)}/${keys.length}${bad ? `  ${bad} with wrong placeholders` : ''}`);
  }
} else if (a && b) {
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,8})?$/.test(a)) throw new Error(`Not a language code: ${a}`);
  const out = {}, problems = [];
  const seen = new Set();
  for (const line of readFileSync(b, 'utf8').split(/\r?\n/)) {
    const m = /^(\d+)\t(.*)$/.exec(line);
    if (!m) { if (line.trim()) problems.push(`unreadable line: ${line.slice(0, 60)}`); continue; }
    const i = Number(m[1]) - 1, key = keys[i];
    const text = m[2].replace(/\\n/g, '\n').trim();
    if (key === undefined) { problems.push(`no string ${m[1]}`); continue; }
    if (seen.has(i)) problems.push(`string ${m[1]} translated twice`);
    seen.add(i);
    if (!text) continue;
    if (holes(key) !== holes(text)) { problems.push(`${m[1]} placeholders differ: ${JSON.stringify(key)} -> ${JSON.stringify(text)}`); continue; }
    out[key] = text;
  }
  const ordered = Object.fromEntries(keys.filter((k) => k in out).map((k) => [k, out[k]]));
  writeFileSync(path.join(dir, `${a}.json`), JSON.stringify(ordered, null, 0).replace(/","/g, '",\n"') + '\n');
  writeIndex();
  const missing = keys.length - Object.keys(ordered).length;
  console.log(`${a}: ${Object.keys(ordered).length}/${keys.length} strings${missing ? ` (${missing} missing)` : ''}`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  if (problems.length > 20) console.log(`  … ${problems.length - 20} more`);
} else {
  console.log('usage: node scripts/i18n-import.mjs <code> <file> | --check');
}
