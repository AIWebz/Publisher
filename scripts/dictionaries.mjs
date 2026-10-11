// Downloads the spelling dictionaries for the 85 proofing languages from pinned sources, converts
// them to UTF-8 and writes gzip files plus a manifest to app/dict/ (git-ignored):
//   <code>.aff.gz + <code>.dic.gz   Hunspell dictionaries (checked with nspell)
//   <code>.words.gz                 word lists (one word per line, most frequent first) for
//                                   languages without a usable Hunspell dictionary
//   index.json, LICENSES.md
// Run: npm run dicts   (skips files that already exist; --force re-downloads)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { LANGUAGES } from '../src/core/languages.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'app/dict');
const CACHE = path.join(ROOT, 'node_modules/.cache/folio-dicts');
const FORCE = process.argv.includes('--force');

export const SOURCES = {
  lo: { name: 'LibreOffice dictionaries', repo: 'LibreOffice/dictionaries', sha: '32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4' },
  wooorm: { name: 'wooorm/dictionaries', repo: 'wooorm/dictionaries', sha: '8cfea406b505e4d7df52d5a19bce525df98c54ab' },
  tito: { name: 'titoBouzout/Dictionaries', repo: 'titoBouzout/Dictionaries', sha: '65e552e7216cecab2b497c898a9a7ee1e2e2de11' },
  freq: { name: 'hermitdave/FrequencyWords (OpenSubtitles 2018), CC BY-SA 4.0', repo: 'hermitdave/FrequencyWords', sha: '525f9b560de45753a5ea01069454e72e9aa541c6' }
};

const raw = (src, file) => `https://raw.githubusercontent.com/${SOURCES[src].repo}/${SOURCES[src].sha}/${file.split('/').map(encodeURIComponent).join('/')}`;

function download(url, dest) {
  if (fs.existsSync(dest) && !FORCE) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-o', dest + '.part', url], { stdio: 'inherit' });
  fs.renameSync(dest + '.part', dest);
  return dest;
}

/** Decode a Hunspell file using the SET encoding declared in its .aff. */
function decode(buf, encoding) {
  const enc = (encoding || 'UTF-8').toLowerCase().replace(/^microsoft-cp/, 'windows-').replace(/^cp(\d+)/, 'windows-$1');
  let text;
  try { text = new TextDecoder(enc === 'utf8' ? 'utf-8' : enc).decode(buf); } catch { text = new TextDecoder('utf-8').decode(buf); }
  return text.replace(/^﻿/, '');
}

function affEncoding(buf) {
  const head = buf.subarray(0, 4000).toString('latin1');
  const m = /^SET\s+(\S+)/m.exec(head);
  return m ? m[1] : 'UTF-8';
}

/** Word list from a FrequencyWords "word count" file: letters only, count >= min, capped. */
function wordList(text, { min = 3, max = 400000, script }) {
  const out = [];
  const seen = new Set();
  const ok = script ? new RegExp(`^[\\p{Script=${script}}\\p{M}'’-]+$`, 'u') : /^[\p{L}\p{M}'’-]+$/u;
  for (const line of text.split('\n')) {
    const i = line.lastIndexOf(' ');
    if (i < 1) continue;
    const word = line.slice(0, i).trim(), count = +line.slice(i + 1);
    if (!(count >= min) || !ok.test(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

const gz = (s) => zlib.gzipSync(Buffer.from(s, 'utf8'), { level: 9 });

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const index = {};
  const licenses = ['# Spelling dictionaries', '', 'Folio ships one spelling dictionary per proofing language. Each dictionary keeps the licence of its source (see the source folder at the pinned commit).', ''];
  for (const lang of LANGUAGES.filter((l) => l.dict)) {
    for (const d of lang.dicts) {
      const id = d.id;
      const src = SOURCES[d.src];
      const entry = { lang: lang.code, source: src.name, url: `https://github.com/${src.repo}/tree/${src.sha}/${path.posix.dirname(d.path || d.aff || '')}` };
      if (d.src === 'freq') {
        const file = download(raw('freq', d.path), path.join(CACHE, 'freq', path.basename(d.path)));
        const words = wordList(fs.readFileSync(file, 'utf8'), { min: d.min || 3, script: d.script });
        const out = path.join(OUT, `${id}.words.gz`);
        fs.writeFileSync(out, gz(words.join('\n')));
        Object.assign(entry, { engine: 'words', files: [`${id}.words.gz`], words: words.length, bytes: fs.statSync(out).size, license: 'CC BY-SA 4.0' });
      } else {
        const affFile = download(raw(d.src, d.aff), path.join(CACHE, d.src, d.aff));
        const dicFile = download(raw(d.src, d.dic), path.join(CACHE, d.src, d.dic));
        const affBuf = fs.readFileSync(affFile), dicBuf = fs.readFileSync(dicFile);
        const enc = affEncoding(affBuf);
        const aff = decode(affBuf, enc).replace(/^SET\s+\S+/m, 'SET UTF-8');
        const dic = decode(dicBuf, enc);
        fs.writeFileSync(path.join(OUT, `${id}.aff.gz`), gz(aff));
        fs.writeFileSync(path.join(OUT, `${id}.dic.gz`), gz(dic));
        Object.assign(entry, { engine: 'hunspell', files: [`${id}.aff.gz`, `${id}.dic.gz`], bytes: fs.statSync(path.join(OUT, `${id}.aff.gz`)).size + fs.statSync(path.join(OUT, `${id}.dic.gz`)).size, encoding: enc });
      }
      index[id] = entry;
      licenses.push(`- **${id}** (${lang.name}): ${src.name} — ${entry.url}${entry.license ? ` — ${entry.license}` : ''}`);
      process.stdout.write(`${id} `);
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  fs.writeFileSync(path.join(OUT, 'LICENSES.md'), licenses.join('\n') + '\n');
  const total = Object.values(index).reduce((n, e) => n + e.bytes, 0);
  console.log(`\n${Object.keys(index).length} dictionaries, ${(total / 1048576).toFixed(1)} MB compressed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
