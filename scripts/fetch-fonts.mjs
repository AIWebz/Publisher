// Downloads Google Fonts families (SIL Open Font License) into app/fonts and appends their @font-face
// rules to app/fonts/fonts.css — latin and latin-ext only, variable weights where a family has them.
//   node scripts/fetch-fonts.mjs "Montserrat:ital,wght@0,100..900;1,100..900" "Bebas Neue" …
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'app', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let cssOut = readFileSync(path.join(dir, 'fonts.css'), 'utf8');

for (const spec of process.argv.slice(2)) {
  const family = spec.split(':')[0];
  if (cssOut.includes(`font-family: '${family}'`)) { console.log(`skip ${family} (already bundled)`); continue; }
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%20/g, '+').replace(/%3A/g, ':').replace(/%40/g, '@').replace(/%2C/g, ',').replace(/%3B/g, ';')}&display=swap`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${family}: ${res.status}`);
  const css = await res.text();
  // blocks are preceded by a /* subset */ comment
  const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[^}]+\})/g)].filter((m) => m[1] === 'latin' || m[1] === 'latin-ext');
  for (const [, subset, block] of blocks) {
    const style = /font-style: (\w+)/.exec(block)[1];
    const weight = /font-weight: ([\d ]+);/.exec(block)[1].trim().replace(' ', '-');
    const url = /src: url\(([^)]+)\)/.exec(block)[1];
    const file = `${family.replace(/\s+/g, '')}-${style}-${weight}-${subset}.woff2`;
    if (!existsSync(path.join(dir, file))) writeFileSync(path.join(dir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    cssOut += '\n' + block.replace(/src: url\([^)]+\)/, `src: url(${file})`) + '\n';
  }
  console.log(`${family}: ${blocks.length} faces`);
}
writeFileSync(path.join(dir, 'fonts.css'), cssOut);
