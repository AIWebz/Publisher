# Folio Publisher

A desktop-publishing studio in the browser, in the spirit of Microsoft Publisher, with a cleaner interface and serif typography throughout.

- **Templates:** event flyer, newsletter, invitation, greeting card, lecture poster, postcard, business card, or a blank page
- **Ribbon:** Home, Insert, Design, Arrange and View tabs, a pages panel and a property inspector
- **Objects:** text boxes, headings, pull quotes, pictures (insert, paste or drag-and-drop), picture placeholders, rectangles, ellipses, triangles, stars, lines and ornamental rules
- **Editing:** move, resize and rotate with handles, smart snapping guides, z-order, align to page, undo/redo, and a right-click menu
- **Design:** colour schemes and font schemes that restyle the whole publication, plus page sizes and orientation
- **Files:** autosaves in the browser, *Save a Copy* / *Open* `.folio` files, and print or export to PDF
- **Installable PWA:** an **Install app** button, offline support through a service worker, and a standalone window

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish and install

`.github/workflows/pages.yml` deploys the site to GitHub Pages. Turn it on in **Settings → Pages → Source: GitHub Actions**, then open the published URL and click **Install app** in the title bar.
