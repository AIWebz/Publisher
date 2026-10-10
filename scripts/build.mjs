// Build the renderer bundle: src/main.js -> app/build/app.js (+ app.css), and copy runtime assets.
import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

await mkdir(path.join(root, 'app/dict'), { recursive: true });
await copyFile(path.join(root, 'node_modules/dictionary-en/index.aff'), path.join(root, 'app/dict/en.aff'));
await copyFile(path.join(root, 'node_modules/dictionary-en/index.dic'), path.join(root, 'app/dict/en.dic'));

const options = {
  entryPoints: { app: path.join(root, 'src/main.js') },
  outdir: path.join(root, 'app/build'),
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  legalComments: 'none',
  loader: { '.woff2': 'file', '.svg': 'text' },
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
