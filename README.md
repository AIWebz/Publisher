# Folio Publisher

Folio is a desktop-publishing app for flyers, newsletters, brochures, cards, calendars and posters, with
a clean ribbon interface set in the Inter typeface, with White, Colorful, Dark Gray and Black themes and six accent colours. It runs as a desktop app on **Windows 10/11** and
**macOS 13 or later**, as a desktop app. Publications are saved as
`.folio` files.

## Download and install

Download Folio from the **[Folio website](https://aiwebz.github.io/Publisher/)**. It picks the installer for your
computer; all three are listed under *Download*:

| File | For |
| --- | --- |
| `Folio-Publisher-Setup-<version>.exe` | Windows 10 and 11, 64-bit (also runs on Windows on Arm through x64 emulation) |
| `Folio-Publisher-<version>-mac-arm64.dmg` | Macs with Apple silicon (M1 or later) |
| `Folio-Publisher-<version>-mac-x64.dmg` | Macs with an Intel processor |

The site also lists SHA-256 checksums for each file.

### Windows

1. Download **`Folio-Publisher-Setup-<version>.exe`** and run it.
2. The installer is not code-signed, so Windows SmartScreen may show *"Windows protected your PC"*.
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
- **Text wrap** — text flows around pictures, shapes and tables in front of a text box: Square, Tight, Through, Top and
  Bottom or None; both sides, left, right or largest side; distance from text; works across columns and linked boxes
  (Wrap Text on Home and every Format tab, Layout dialog, Format pane, right-click menu).
- **Pictures and shapes** — non-destructive crop (pan, zoom, aspect ratios), fill/fit/stretch, recolour and
  brightness/contrast/saturation, borders, solid and gradient fills, outlines with dashes and arrowheads,
  shadows, transparency, quick styles, a building-blocks library and your own saved blocks.
- **Pages** — add, duplicate, delete, reorder, go to; custom and standard sizes, orientation, margins, columns,
  measurement units, facing pages (two-page spreads), bleed, page backgrounds and **master pages**.
- **Mail merge** — import recipients from CSV/TSV, Excel (.xlsx) or OpenDocument (.ods) files, or type a list; edit,
  sort, filter and include/exclude records; insert merge fields, address blocks and greeting lines; preview each
  recipient; merge to a new publication, fill label/card sheets, or export one PDF (or one PDF per recipient).
- **Languages and spelling** — 85 proofing languages (Review › Language › Set Proofing Language, per text box or whole
  publication) with a Hunspell dictionary for each (98 dictionaries including regional variants), check spelling as
  you type with right-click suggestions, right-to-left text for Arabic, Hebrew, Persian and Urdu, and Proofing and
  Language pages in File › Options.
- **Review** — spelling (Ignore, Add to Dictionary per language, Change All), Find & Replace that
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

- Publications use Folio's own `.folio` format; share finished work as PDF or images.
- The interface itself is in English; the 85 languages are proofing (spelling) languages.
- The installers are not code-signed (see the install notes above).
- Tight wrapping follows the outline of ellipses; other shapes and pictures wrap by their rectangle, and wrap
  points cannot be edited by hand. Imposition covers common layouts (booklet, n-up, repeat), not every
  option of a commercial print shop.
- Collaboration and cloud sync are not included; files are saved where you choose.

## Develop

Requirements: Node.js 22 and npm.

```sh
npm ci                 # install dependencies
npm start              # build (with source maps) and run the desktop app
npm run watch          # rebuild the bundle on change (reload the window with Ctrl/Cmd+R in development)
npm test               # unit tests (node --test)
npm run dicts          # download the 85-language spelling dictionaries into app/dict (npm run build does this once)
```

Packaging (electron-builder; installers go to `dist/`):

```sh
npm run dist:win       # Windows x64 NSIS installer — run on Windows
npm run dist:mac       # macOS .dmg and .zip for arm64 and x64 — run on macOS
npm run pack           # unpacked app for the current OS (quick check; Linux works too)
npm run build:icons    # regenerate every icon, the DMG background and installer art from build/brand/logo-source.webp (needs Pillow)
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
app/        app window: index.html, bundled fonts, icons, spelling dictionaries (app/build and app/dict are generated)
site/       the download website (deployed to GitHub Pages with the installers)
desktop/    Electron main process, preload bridge and IPC modules
src/        core editor, engines (text flow, tables, mail merge, spelling, export, templates) and features
build/      installer artwork: icons, DMG background, NSIS sidebar (build/tools regenerates them)
tests/      unit tests and end-to-end scripts
```

## Publishing

`.github/workflows/build.yml` runs the unit tests and builds the Windows installer (on `windows-latest`) and the Mac
disk images (on `macos-latest`) for every push and pull request, and keeps them as workflow artifacts for 30 days.
Every push to the release branch publishes (or run the *Build desktop apps* workflow from the **Actions** tab with
**Publish** ticked): it builds the installers, deploys the download website in `site/` together
with the installers to GitHub Pages (`downloads/latest.json` tells the page which files to offer), and removes any
installers left in GitHub Releases. GitHub Pages must use **GitHub Actions** as its source (Settings → Pages).

### Signing the Windows installer

Windows shows *"Windows protected your PC"* (SmartScreen) for unsigned installers. The build signs the installer
automatically once a code-signing identity is added under **Settings → Secrets and variables → Actions** — no code
changes needed:

- **Azure Trusted Signing** (recommended, about $10/month): secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET` (an app registration with the *Trusted Signing Certificate Profile Signer* role) and
  variables `AZURE_SIGN_ENDPOINT` (e.g. `https://eus.codesigning.azure.net`), `AZURE_SIGN_ACCOUNT`,
  `AZURE_SIGN_PROFILE` and `AZURE_SIGN_PUBLISHER` (the certificate's subject name).
- **A code-signing certificate file** from a certificate authority: secrets `WIN_CSC_LINK` (the `.pfx`, base64) and
  `WIN_CSC_KEY_PASSWORD`.

A signed installer names its publisher instead of "Unknown publisher". SmartScreen can still warn about a new
publisher until enough people have downloaded the signed installer for it to build a reputation.

## Licences

The bundled typefaces are licensed under the SIL Open Font License (`app/fonts/OFL.txt`). The English
spelling dictionary comes from the `dictionary-en` package (MIT/BSD-style licences, see its package).
