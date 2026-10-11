// Packaging configuration (package.json "build") and the CI workflows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cfg = pkg.build;
const exists = (f) => existsSync(path.join(ROOT, f));

let yaml = null;
try { yaml = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/js-yaml')); } catch { /* optional */ }
const workflow = (name) => yaml.load(readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8'));

test('packaged files: built app and desktop shell only, no sources or maps', () => {
  assert.equal(pkg.main, 'desktop/main.js');
  assert.ok(cfg.files.includes('app/**/*'));
  assert.ok(cfg.files.includes('desktop/**/*'));
  assert.ok(cfg.files.some((f) => f.startsWith('!') && f.includes('.map')), 'source maps excluded');
  assert.ok(!cfg.files.some((f) => /^src\b/.test(f)), 'src/ is not packaged');
  assert.equal(cfg.directories.buildResources, 'build');
  assert.equal(cfg.publish, null, 'electron-builder never publishes; CI does');
});

test('macOS: dmg + zip for Apple silicon and Intel, graphics category, dark mode, ad-hoc signed', () => {
  const mac = cfg.mac;
  const byTarget = Object.fromEntries(mac.target.map((t) => [t.target, [...t.arch].sort()]));
  assert.deepEqual(byTarget.dmg, ['arm64', 'x64']);
  assert.deepEqual(byTarget.zip, ['arm64', 'x64']);
  assert.equal(mac.category, 'public.app-category.graphics-design');
  assert.equal(mac.darkModeSupport, true);
  assert.equal(mac.hardenedRuntime, false);
  // Ad-hoc signature ("-"): Apple silicon refuses to run modified, unsigned bundles.
  assert.equal(mac.identity, '-');
  assert.ok(mac.artifactName.includes('${arch}'), 'one file per architecture');
  assert.ok(exists(mac.icon), mac.icon);
});

test('macOS: .folio documents are declared with an exported UTI and a document icon', () => {
  const info = cfg.mac.extendInfo;
  const uti = info.UTExportedTypeDeclarations.find((u) => u.UTTypeIdentifier === 'com.folio.publisher.publication');
  assert.ok(uti);
  assert.deepEqual(uti.UTTypeTagSpecification['public.filename-extension'], ['folio']);
  assert.ok(uti.UTTypeConformsTo.includes('public.data'));
  const doc = info.CFBundleDocumentTypes.find((d) => d.LSItemContentTypes.includes(uti.UTTypeIdentifier));
  assert.ok(doc);
  assert.equal(doc.CFBundleTypeRole, 'Editor');
  // The icon files named in Info.plist are copied into Contents/Resources.
  for (const name of [doc.CFBundleTypeIconFile, uti.UTTypeIconFile]) {
    const res = cfg.mac.extraResources.find((r) => r.to === name);
    assert.ok(res, `${name} is shipped`);
    assert.ok(exists(res.from), res.from);
  }
  assert.ok(!cfg.fileAssociations, 'mac document types come from extendInfo only (no duplicates)');
});

test('DMG layout: background art and Applications link', () => {
  assert.ok(exists(cfg.dmg.background));
  assert.ok(exists(cfg.dmg.background.replace('.png', '@2x.png')));
  const link = cfg.dmg.contents.find((c) => c.type === 'link');
  assert.equal(link.path, '/Applications');
  assert.ok(cfg.dmg.contents.find((c) => c.type === 'file'));
});

test('Windows: x64 NSIS installer with branded sidebar and .folio association', () => {
  const win = cfg.win;
  assert.deepEqual(win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(win.artifactName, 'Folio-Publisher-Setup-${version}.${ext}');
  assert.ok(exists(win.icon));
  const fa = win.fileAssociations.find((f) => f.ext === 'folio');
  assert.ok(fa && exists(fa.icon));
  const nsis = cfg.nsis;
  assert.equal(nsis.oneClick, false);
  for (const k of ['installerSidebar', 'uninstallerSidebar', 'installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
    assert.ok(exists(nsis[k]), `${k}: ${nsis[k]}`);
  }
});

test('npm scripts build each platform without publishing', () => {
  assert.match(pkg.scripts['dist:win'], /electron-builder --win .*--publish never/);
  assert.match(pkg.scripts['dist:mac'], /electron-builder --mac .*--publish never/);
  assert.match(pkg.scripts.pack, /electron-builder --dir/);
  for (const s of ['dist', 'dist:win', 'dist:mac', 'pack']) assert.match(pkg.scripts[s], /scripts\/build\.mjs/, `${s} builds the bundle first`);
});

test('CI builds Windows and macOS and releases only from matching version tags', { skip: !yaml && 'js-yaml not installed' }, () => {
  assert.ok(!exists('.github/workflows/windows.yml'), 'replaced by build.yml');
  const wf = workflow('build.yml');
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.ok(wf.on.push.tags.includes('v*'));
  const build = wf.jobs.build;
  assert.deepEqual(build.permissions, { contents: 'read' });
  assert.deepEqual(build.strategy.matrix.include.map((m) => m.os).sort(), ['macos-latest', 'windows-latest']);
  const runs = build.steps.map((s) => s.run || '').join('\n');
  for (const cmd of ['npm ci', 'npm test', 'npm run build', 'electron-builder']) assert.ok(runs.includes(cmd), cmd);
  assert.ok(build.steps.some((s) => String(s.uses).startsWith('actions/upload-artifact')));

  const rel = wf.jobs.release;
  assert.equal(rel.needs, 'build');
  assert.deepEqual(rel.permissions, { contents: 'write' });
  assert.match(rel.if, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.ok(rel.steps.some((s) => String(s.uses).startsWith('actions/download-artifact')));
  const publish = rel.steps.find((s) => String(s.uses).startsWith('softprops/action-gh-release'));
  assert.equal(publish.with.tag_name, 'v${{ steps.version.outputs.version }}');
  for (const ext of ['exe', 'dmg', 'zip']) assert.ok(publish.with.files.includes(`*.${ext}`), ext);
  // Tag must equal v<version> in both jobs.
  for (const job of [build, rel]) assert.ok(job.steps.some((s) => (s.run || '').includes('GITHUB_REF_NAME') && s.env?.EXPECTED));

  for (const [name, job] of Object.entries(wf.jobs)) {
    for (const s of job.steps) {
      if (String(s.uses).startsWith('actions/checkout')) assert.equal(s.with?.['persist-credentials'], false, `${name}: checkout`);
    }
  }
});

test('Pages workflow builds the web app without downloading Electron', { skip: !yaml && 'js-yaml not installed' }, () => {
  const wf = workflow('pages.yml');
  const steps = wf.jobs.deploy.steps;
  const ci = steps.find((s) => s.run === 'npm ci');
  assert.equal(ci.env.ELECTRON_SKIP_BINARY_DOWNLOAD, '1');
  assert.ok(steps.some((s) => s.run === 'npm run build'));
  const upload = steps.find((s) => String(s.uses).startsWith('actions/upload-pages-artifact'));
  assert.equal(upload.with.path, 'app');
  assert.equal(steps.find((s) => String(s.uses).startsWith('actions/checkout')).with['persist-credentials'], false);
});
