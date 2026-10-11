// Writes downloads/latest.json and SHA256SUMS.txt for the download website.
// Usage: node scripts/site-manifest.mjs <downloads dir> <version>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dir, version] = process.argv.slice(2);
const names = fs.readdirSync(dir).filter((n) => /\.(exe|dmg)$/.test(n));
const pick = (re) => names.find((n) => re.test(n));
const info = (name) => name && { name, size: fs.statSync(path.join(dir, name)).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex') };
const files = { win: info(pick(/Setup.*\.exe$/)), macArm: info(pick(/arm64\.dmg$/)), macIntel: info(pick(/x64\.dmg$/)) };
for (const [k, v] of Object.entries(files)) if (!v) { console.error(`Missing installer: ${k}`); process.exit(1); }
for (const n of fs.readdirSync(dir)) if (!names.includes(n)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ version, files }, null, 2));
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), Object.values(files).map((f) => `${f.sha256}  ${f.name}`).join('\n') + '\n');
console.log(JSON.stringify({ version, files }, null, 2));
