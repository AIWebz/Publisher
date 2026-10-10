# Folio Publisher

A desktop-publishing studio for Windows 11, in the spirit of Microsoft Publisher, with a cleaner interface and serif typography throughout. It also runs in the browser as an installable web app.

## Install on Windows 11

1. Open the repository's **Releases** page, or the latest **Build Windows app** run under **Actions**.
2. Download **`Folio-Publisher-Setup-<version>.exe`** and run it.
3. The installer isn't code-signed, so SmartScreen may show *"Windows protected your PC"*. Choose **More info → Run anyway**.
4. Pick an install folder. The installer adds Start menu and desktop shortcuts and associates `.folio` files with Folio.

The app runs in its own window with native Windows title-bar controls (including Snap layouts) and works fully offline.

## Features

- **Templates:** event flyer, newsletter, invitation, greeting card, lecture poster, postcard, business card, or a blank page
- **Ribbon:** Home, Insert, Design, Arrange and View tabs, a pages panel and a property inspector
- **Objects:** text boxes, headings, pull quotes, pictures (insert, paste or drag-and-drop), picture placeholders, rectangles, ellipses, triangles, stars, lines and ornamental rules
- **Editing:** move, resize and rotate with handles, smart snapping guides, z-order, align to page, undo/redo, and a right-click menu with spelling suggestions
- **Design:** colour schemes and font schemes that restyle the whole publication; page sizes and orientation
- **Files (desktop):** native *Open*, *Save* and *Save As* for `.folio` files, *Export as PDF* at the exact page size, *Print*, and a prompt to save unsaved changes when you close the window. Your latest work is also autosaved to your profile.
- **Appearance:** light and dark themes (follows Windows by default; change it under **View → Theme**)
- **Fonts:** ten open-licence serif families bundled with the app (see `fonts/OFL.txt`)

### Keyboard shortcuts

| Action | Keys |
| --- | --- |
| New from template | Ctrl+N |
| Open | Ctrl+O |
| Save / Save As | Ctrl+S / Ctrl+Shift+S |
| Print | Ctrl+P |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Cut / Copy / Paste / Duplicate | Ctrl+X / Ctrl+C / Ctrl+V / Ctrl+D |
| Bold / Italic / Underline | Ctrl+B / Ctrl+I / Ctrl+U |
| Nudge | Arrow keys (Shift for 10 px) |
| Zoom | Ctrl+= / Ctrl+- / Ctrl+0 (fit), or Ctrl + mouse wheel |
| Edit selected text | Enter or double-click |

## Develop

```sh
npm install
npm start          # run the desktop app
npm run dist       # build dist/Folio-Publisher-Setup-<version>.exe (run on Windows)
```

`.github/workflows/windows.yml` builds the installer on a Windows runner for every push to `main` (or this branch) and for `v*` tags. It uploads the `.exe` as a build artifact and publishes it as a GitHub release named after the version in `package.json`. To ship a new release, bump `version` in `package.json` before you push.

### Web version

The same app runs as a static site (`python3 -m http.server`, then open `http://localhost:8000`). `.github/workflows/pages.yml` deploys it to GitHub Pages; turn that on under **Settings → Pages → Source: GitHub Actions**.
