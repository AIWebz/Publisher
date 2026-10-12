// Makes Folio Publisher serial numbers.
//
//   node scripts/license-keygen.mjs <count> <serials.txt>
//
// Makes <count> new serials, appends them to <serials.txt> (your list to hand out; keep it out of the
// repository) and their fingerprints to desktop/serials.dat (committed; the app checks serials against
// it). Serials work in builds made after they were added.
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { makeSerial, fingerprint, normalize } = require('../desktop/license.js');
const dat = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'desktop', 'serials.dat');
const [count, out] = [Number(process.argv[2]), process.argv[3]];

if (!(count > 0) || !out) {
  console.log('usage: node scripts/license-keygen.mjs <count> <serials.txt>');
} else {
  const serials = Array.from({ length: count }, makeSerial);
  appendFileSync(dat, Buffer.concat(serials.map((s) => fingerprint(normalize(s)))));
  appendFileSync(out, serials.join('\n') + '\n');
  console.log(`${count} serials added to ${out}; desktop/serials.dat now holds ${readFileSync(dat).length / 8}.`);
}
