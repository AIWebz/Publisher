// Folio Publisher — packaged-app end-to-end test (Linux, under xvfb).
//   xvfb-run -a node tests/e2e/desktop-package.mjs [outDir]
// 1. Builds the bundle and packages the app with electron-builder (`--linux dir`, no wine needed),
//    using the same "files"/asar configuration the Windows and macOS installers use.
// 2. Checks the asar: built app, fonts, dictionary, desktop shell; no sources, maps or node_modules.
// 3. Launches the packaged binary, checks it boots to the start screen without console errors,
//    and that a .folio file passed on the command line (how Windows opens associated files) opens.
import { spawnSync } from 'node:child_process';
import { createRequire, builtinModules } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, check, finish, launch, waitForBoot, scratchDir, writeSampleFolio, forceQuit } from './desktop-lib.mjs';

const require = createRequire(import.meta.url);
const asar = require(path.join(ROOT, 'node_modules/@electron/asar'));
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : scratchDir('desktop-builds');
fs.mkdirSync(OUT, { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  if (r.status !== 0) console.error(r.stdout, r.stderr);
  return r.status === 0;
};

// the packaged app asks for a serial: package it with a test serial's fingerprint added, and give the profile that serial
const { makeSerial, fingerprint, normalize } = require(path.join(ROOT, 'desktop/license.js'));
const testSerial = makeSerial();
const datPath = path.join(ROOT, 'desktop/serials.dat');
const dat = fs.existsSync(datPath) ? fs.readFileSync(datPath) : null;

// ---- 1. build + package ----
check(run(process.execPath, ['scripts/build.mjs']), 'npm run build succeeds');
const outDir = path.join(OUT, 'out');
fs.rmSync(outDir, { recursive: true, force: true });
fs.writeFileSync(datPath, Buffer.concat([dat || Buffer.alloc(0), fingerprint(normalize(testSerial))]));
try {
  check(run(process.execPath, [path.join(ROOT, 'node_modules/electron-builder/cli.js'), '--linux', 'dir', '--publish', 'never',
    `-c.directories.output=${outDir}`]), 'electron-builder --linux dir succeeds');
} finally {
  if (dat) fs.writeFileSync(datPath, dat); else fs.rmSync(datPath, { force: true });
}

const unpacked = path.join(outDir, 'linux-unpacked');
const binary = path.join(unpacked, pkg.build.linux?.executableName || pkg.name);
const archive = path.join(unpacked, 'resources', 'app.asar');
check(fs.existsSync(binary), `packaged binary ${path.relative(OUT, binary)}`);
check(fs.existsSync(archive), 'resources/app.asar');
check(!fs.existsSync(path.join(unpacked, 'resources', 'app-update.yml')), 'no auto-update feed (publish: null)');

// ---- 2. asar contents ----
const entries = new Set(asar.listPackage(archive).map((p) => p.replace(/\\/g, '/').replace(/^\//, '')));
for (const f of ['package.json', 'app/index.html', 'app/build/app.js', 'app/build/app.css', 'app/dict/en.aff', 'app/dict/en.dic',
  'app/icons/icon-512.png', 'app/manifest.webmanifest', 'desktop/main.js', 'desktop/preload.js']) {
  check(entries.has(f), `asar contains ${f}`);
}
const fonts = [...entries].filter((f) => /^app\/fonts\/.+\.woff2$/.test(f));
check(fonts.length >= 10, `asar contains bundled fonts (${fonts.length} woff2)`);
check(entries.has('app/fonts/OFL.txt'), 'asar contains the font licence');
const desktopJs = [...entries].filter((f) => /^desktop\/[^/]+\.js$/.test(f));
const localDesktop = fs.readdirSync(path.join(ROOT, 'desktop')).filter((f) => f.endsWith('.js')).map((f) => `desktop/${f}`);
check(localDesktop.every((f) => entries.has(f)), `every desktop module is packaged (${desktopJs.length})`, localDesktop.filter((f) => !entries.has(f)));
check(![...entries].some((f) => f.endsWith('.map')), 'no source maps');
check(![...entries].some((f) => f.startsWith('src/')), 'no src/');
check(![...entries].some((f) => f.startsWith('node_modules/')), 'no node_modules (renderer deps are bundled)');
check(![...entries].some((f) => f.startsWith('tests/') || f.startsWith('build/') || f.startsWith('legacy/')), 'no tests, build resources or legacy files');

// Every require() in the packaged main-process code resolves inside the asar or to Electron/Node.
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const unresolved = [];
for (const f of desktopJs) {
  const src = asar.extractFile(archive, f).toString('utf8');
  for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const id = m[1];
    if (id === 'electron' || builtins.has(id)) continue;
    if (id.startsWith('.')) {
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(f), id));
      if ([p, `${p}.js`, `${p}/index.js`].some((c) => entries.has(c))) continue;
    }
    unresolved.push(`${f}: ${id}`);
  }
}
check(!unresolved.length, 'main-process requires resolve in the package', unresolved);
const packagedPkg = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
check(packagedPkg.main === 'desktop/main.js' && packagedPkg.version === pkg.version, `packaged package.json main/version (${packagedPkg.version})`);

// ---- 3. launch the packaged app ----
const profile = path.join(OUT, 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'license.json'), JSON.stringify({ serial: testSerial }));
let { electronApp, page, errors } = await launch({ executablePath: binary, args: [], profile });
try {
  await waitForBoot(page);
  check(true, 'packaged app boots');
  const info = await electronApp.evaluate(({ app, BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { packaged: app.isPackaged, name: app.getName(), version: app.getVersion(), title: w.getTitle(), devTools: w.webContents.getLastWebPreferences().devTools, userData: app.getPath('userData') };
  });
  check(info.packaged, 'app.isPackaged');
  check(info.version === pkg.version, `version ${info.version}`);
  check(info.devTools === false, 'DevTools disabled in the packaged app');
  check(path.resolve(info.userData) === path.resolve(profile), 'profile isolated for the test');
  check(/Folio Publisher/.test(info.title), `window title "${info.title}"`);
  const start = await page.evaluate(() => ({
    classes: document.documentElement.className,
    text: document.body.innerText.slice(0, 2000),
    fontsOk: document.fonts.status
  }));
  check(/os-linux/.test(start.classes) && /is-desktop/.test(start.classes), `desktop chrome classes (${start.classes})`);
  check(start.text.length > 20, 'start screen has content');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'packaged-start.png') });
  check(errors.length === 0, 'no console errors on start', errors);
} catch (err) {
  check(false, `packaged app run: ${err.message}`);
} finally {
  await forceQuit(electronApp);
}

// A .folio file named on the command line opens (Windows file association / "Open with").
const docFile = await writeSampleFolio(path.join(OUT, 'Command Line.folio'), { title: 'Command Line', text: 'Sample from the command line' });
({ electronApp, page, errors } = await launch({ executablePath: binary, args: [docFile], profile }));
try {
  await waitForBoot(page);
  await page.waitForFunction(() => /Command Line/.test(document.title), null, { timeout: 15000 }).catch(() => {});
  const title = await page.evaluate(() => document.title);
  const winTitle = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
  check(/Command Line/.test(title) || /Command Line/.test(winTitle), `file from argv opened ("${winTitle}")`);
  const shown = await page.evaluate(() => document.body.innerText.includes('Sample from the command line'));
  check(shown, 'its content is rendered');
  check(errors.length === 0, 'no console errors opening a file', errors);
} catch (err) {
  check(false, `open from argv: ${err.message}`);
} finally {
  await forceQuit(electronApp);
}

finish('desktop-package');
