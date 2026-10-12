// Bundles the download website's 3D scenes (site/src/scene.js, three.js) into site/assets/scene.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['site/src/scene.js'],
  outfile: 'site/assets/scene.js',
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020', 'safari15'],
  legalComments: 'eof',
  logLevel: 'info'
});
