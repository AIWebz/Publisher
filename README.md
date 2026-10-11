# Folio Publisher

Folio is a desktop-publishing app for flyers, newsletters, brochures, cards, calendars and posters, with
a ribbon interface and serif typography throughout. It runs as a desktop app on **Windows 10/11** and
**macOS 13 or later**, and in the browser as an installable web app. Publications are saved as
`.folio` files.

## Download and install

Get the latest installers from the **[Releases page](https://github.com/AIWebz/Publisher/releases/latest)**.

| File | For |
| --- | --- |
| `Folio-Publisher-Setup-<version>.exe` | Windows 10 and 11, 64-bit (also runs on Windows on Arm through x64 emulation) |
| `Folio-Publisher-<version>-mac-arm64.dmg` | Macs with Apple silicon (M1 or later) |
| `Folio-Publisher-<version>-mac-x64.dmg` | Macs with an Intel processor |
| `…-mac-*.zip` | The same Mac app without the disk image |
| `SHA256SUMS.txt` | Checksums for all of the above |

### Windows

1. Download **`Folio-Publisher-Setup-<version>.exe`** and run it.
2. The installer is not code-signed, so Microsoft Defender SmartScreen may show *"Windows protected your PC"*.
   Choose **More info → Run anyway**.
3. Choose to install for yourself or for all users, and pick a folder. The installer adds Start menu and
   desktop shortcuts and makes Folio the app for `.folio` files (with its own document icon).
4. Uninstall from **Settings → Apps → Installed apps → Folio Publisher**. Your publications, settings
   and recovery copies are left in place.

Folio uses the native Windows 11 caption buttons (including Snap layouts) over its own title bar.

### macOS

1. Download the disk image for your Mac (`arm64` for Apple silicon, `x64` for Intel; **About This Mac**
   tells you which you have), open it and drag **Folio Publisher** onto **Applications**.
2. Folio is not notarized by Apple (it is ad-hoc signed), so the first time you open it macOS says it
   cannot verify the developer:
   - **macOS 15 Sequoia and later:** click **Done**, open **System Settings → Privacy & Security**, scroll
     to *"Folio Publisher was blocked…"* and click **Open Anyway**, then confirm with your password.
   - **macOS 13–14:** Control-click (or right-click) the app in Applications, choose **Open**, then **Open** again.

   You only need to do this once. (Advanced alternative: `xattr -dr com.apple.quarantine "/Applications/Folio Publisher.app"`.)
3. `.folio` files show the Folio document icon and open in Folio from Finder. Folio has a standard Mac
   menu bar (File, Edit, View, Window, Help), follows the system light/dark appearance and keeps
   running when its last window closes, like other Mac document apps.

### Web

The same app runs in Chrome, Edge, Firefox and Safari from the project's GitHub Pages site and can be
installed from the browser's address bar. In the browser, **Open** and **Save** use the browser's file
pickers (Chrome and Edge save back to the same file; other browsers download a copy), and recovery
copies are kept in the browser's storage.

## Features

<!-- FEATURES -->

## Keyboard shortcuts

<!-- SHORTCUTS -->

## What Folio does not do

<!-- LIMITS -->

## Develop

Requirements: Node.js 22 and npm.

```sh
npm ci                 # install dependencies
npm start              # build (with source maps) and run the desktop app
npm run watch          # rebuild the bundle on change (reload the window with Ctrl/Cmd+R in development)
npm test               # unit tests (node --test)
npm run serve          # build and serve the web app at http://localhost:8765
```

Packaging (electron-builder; installers go to `dist/`):

```sh
npm run dist:win       # Windows x64 NSIS installer — run on Windows
npm run dist:mac       # macOS .dmg and .zip for arm64 and x64 — run on macOS
npm run pack           # unpacked app for the current OS (quick check; Linux works too)
npm run build:icons    # regenerate build/ icons and DMG background from app/icons/icon.svg (needs Playwright)
```

End-to-end tests drive the real Electron app with Playwright (install it globally with
`npm i -g playwright`); on Linux run them under a virtual display:

```sh
npm run build
xvfb-run -a node tests/e2e/desktop-shell.mjs     # title bar, macOS menu, open-file / second instance
xvfb-run -a node tests/e2e/desktop-package.mjs   # packages the app, inspects app.asar, launches the packaged binary
```

The code is plain ES modules bundled with esbuild — no framework. `ARCHITECTURE.md` describes the
document model, the registry that features plug into, the platform layer and the desktop IPC channels.

```
app/        web root: index.html, bundled fonts, icons, spelling dictionary (app/build is generated)
desktop/    Electron main process, preload bridge and IPC modules
src/        core editor, engines (text flow, tables, mail merge, spelling, export, templates) and features
build/      installer artwork: icons, DMG background, NSIS sidebar (build/tools regenerates them)
tests/      unit tests and end-to-end scripts
```

## Releases

`.github/workflows/build.yml` runs the unit tests and builds the Windows installer (on `windows-latest`)
and the Mac disk images (on `macos-latest`) for every push and pull request, and keeps them as workflow
artifacts for 30 days. To publish a release:

1. Set `version` in `package.json` (for example `2.1.0`) and push it.
2. Push the tag `v2.1.0`, **or** run the *Build desktop apps* workflow from the **Actions** tab with
   **Publish release** ticked.

The release job checks that the tag is exactly `v<version>`, then attaches the installers and
`SHA256SUMS.txt` to the GitHub release. `.github/workflows/pages.yml` publishes the web app to GitHub
Pages (enable it under **Settings → Pages → Source: GitHub Actions**).

## Licences

The bundled typefaces are licensed under the SIL Open Font License (`app/fonts/OFL.txt`). The English
spelling dictionary comes from the `dictionary-en` package (MIT/BSD-style licences, see its package).
