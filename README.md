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

- **Ribbon and workspace** — File, Home, Insert, Page Design, Mailings, Review and View tabs, plus contextual
  *Text Box Format*, *Picture Format*, *Shape Format*, *Table Design* and *Table Layout* tabs; document tabs for
  several open publications; page thumbnails; a properties panel and a Layers (selection) pane; rulers, margin,
  column and ruler guides, gridlines, zoom (fit page / fit width / 10–800 %) and panning (Space-drag).
- **Templates** — 41 fully editable templates in 15 categories (flyers, posters, brochures, newsletters, business
  cards, greeting cards, invitations, postcards, labels, envelopes, calendars, certificates, menus, catalogs, price
  lists) plus blank sizes; colour and font scheme choice when creating; *Save as Template* for your own.
- **Objects** — text boxes, pictures, picture placeholders, 24 shapes, lines and arrows, tables and groups, with
  move/resize/rotate handles, smart snapping and alignment guides, multi-selection and marquee, group/ungroup,
  layer order, align and distribute, lock, hide, flip, keyboard nudging and exact position/size fields.
- **Text** — rich text in place (fonts, sizes, bold/italic/underline/strike, super/subscript, colour, highlight,
  character spacing, case), paragraph alignment, line and paragraph spacing, bullets and numbering, indents,
  styles, hyperlinks, symbols, page-number/page-count/date fields, text box margins, columns, vertical alignment,
  shrink/grow to fit, overflow marker, and **linked text frames** that reflow a story across boxes and pages.
- **Pictures and shapes** — non-destructive crop (pan, zoom, aspect ratios), fill/fit/stretch, recolour and
  brightness/contrast/saturation, borders, solid and gradient fills, outlines with dashes and arrowheads,
  shadows, transparency, quick styles, a building-blocks library and your own saved blocks.
- **Pages** — add, duplicate, delete, reorder, go to; custom and standard sizes, orientation, margins, columns,
  measurement units, facing pages (two-page spreads), bleed, page backgrounds and **master pages**.
- **Mail merge** — import recipients from CSV/TSV, Excel (.xlsx) or OpenDocument (.ods) files, or type a list; edit,
  sort, filter and include/exclude records; insert merge fields, address blocks and greeting lines; preview each
  recipient; merge to a new publication, fill label/card sheets, or export one PDF (or one PDF per recipient).
- **Review** — spelling with an English dictionary (Ignore, Add to Dictionary, Change All), Find & Replace that
  keeps formatting, a Design Checker (overflow, off-page objects, low-resolution pictures, missing data) and
  publication statistics.
- **Output** — PDF export at exact page size with embedded fonts and vector text, PNG/JPEG export at 72–600 dpi,
  page ranges, crop marks, bleed, booklet imposition, multiple copies or pages per sheet, and Print with a live
  preview, copies, duplex and printer choice (desktop).
- **Files and safety** — the native `.folio` format keeps every object and setting; Save, Save As, Open, Recent;
  autosave with crash recovery; command-based undo/redo (one step per drag or edit).

## Keyboard shortcuts

| Action | Windows | macOS |
| --- | --- | --- |
| New / Open / Save / Save As | Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | ⌘N / ⌘O / ⌘S / ⇧⌘S |
| Print / Export | Ctrl+P / Ctrl+Shift+E | ⌘P / ⇧⌘E |
| Undo / Redo | Ctrl+Z / Ctrl+Y | ⌘Z / ⇧⌘Z |
| Cut / Copy / Paste / Duplicate | Ctrl+X / C / V / D | ⌘X / C / V / D |
| Group / Ungroup | Ctrl+G / Ctrl+Shift+G | ⌘G / ⇧⌘G |
| Bring forward / Send backward | Ctrl+] / Ctrl+[ | ⌘] / ⌘[ |
| Bold / Italic / Underline | Ctrl+B / I / U | ⌘B / I / U |
| Align left / centre / right / justify | Ctrl+L / E / R / J | ⌘L / E / R / J |
| Bigger / smaller text | Ctrl+Shift+. / , | ⇧⌘. / , |
| Hyperlink | Ctrl+K | ⌘K |
| Find / Replace / Spelling | Ctrl+F / Ctrl+H / F7 | ⌘F / ⌘H / F7 |
| Zoom in / out / whole page / 100 % | Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1 | ⌘= / ⌘- / ⌘0 / ⌘1 |
| Next / previous page | Page Down / Page Up | Page Down / Page Up |
| Nudge object | Arrow keys (Shift ×10, Alt fine) | Arrow keys |
| Edit selected text box | Enter or double-click | Return or double-click |

## What Folio does not do

- It does not open or save Microsoft Publisher `.pub` files. Publications use Folio's own `.folio` format; share
  finished work as PDF or images.
- Spelling uses an English dictionary only.
- The installers are not code-signed (see the install notes above).
- Text inside a text box wraps and flows between linked boxes, but it does not yet flow around other objects on
  the page (no "wrap text around picture"). Imposition covers common layouts (booklet, n-up, repeat), not every
  option of a commercial print shop.
- Collaboration and cloud sync are not included; files are saved where you choose.

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
