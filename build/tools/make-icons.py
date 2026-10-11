"""Regenerate every Folio icon from the logo (build/brand/logo-source.webp, the gradient "F" on white).

Writes: build/brand/logo-mark.png (transparent, 1024 px), app/icons/* (favicon SVG, PWA and touch
icons, in-app mark), build/icon.png|.ico|.icns (app icon), build/folio.ico|.icns (.folio document
icon), build/background.png|@2x (DMG window) and build/installerSidebar.bmp (NSIS).
Run: python3 build/tools/make-icons.py   (needs Pillow)
"""
import base64, io, os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *p: os.path.join(ROOT, *p)
BRAND = [(236, 50, 230), (110, 60, 255), (40, 100, 255), (0, 220, 255)]  # magenta -> violet -> blue -> cyan


def cut_out(img):
    """Remove the white background: opaque where the colour is saturated, soft at the anti-aliased edge."""
    img = img.convert('RGB')
    w, h = img.size
    src = img.load()
    out = Image.new('RGBA', (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = min(r, g, b)
            a = max(0.0, min(1.0, (255 - m - 12) / 60.0))  # ignore off-white compression noise
            if a <= 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # un-blend from white so edge pixels keep the brand colour instead of a pale halo
            k = 1 - a
            un = lambda c: int(max(0, min(255, (c - 255 * k) / a))) if a < 1 else c
            dst[x, y] = (un(r), un(g), un(b), int(a * 255))
    return out


def square(mark, size, pad):
    """The mark centred on a transparent square canvas with `pad` (fraction) margin."""
    box = mark.getbbox()
    m = mark.crop(box)
    inner = int(size * (1 - 2 * pad))
    s = inner / max(m.size)
    m = m.resize((max(1, int(m.width * s)), max(1, int(m.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return c


def tile(mark, size, radius, bg=(255, 255, 255, 255), pad=0.2, shadow=False, inset=0):
    """A rounded tile (macOS style) carrying the mark."""
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    x0, x1 = inset, size - inset
    if shadow:
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((x0, x0 + size * 0.012, x1, x1 + size * 0.012), radius, fill=(20, 16, 60, 90))
        c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.014)))
    ImageDraw.Draw(c).rounded_rectangle((x0, x0, x1, x1), radius, fill=bg, outline=(0, 0, 0, 22), width=max(1, size // 512))
    t = x1 - x0
    m = square(mark, t, pad)
    c.alpha_composite(m, (x0, x0))
    return c


def gradient(w, h, stops=BRAND, horizontal=True):
    g = Image.new('RGB', (w, h))
    px = g.load()
    n = len(stops) - 1
    for i in range(w if horizontal else h):
        t = i / max(1, (w if horizontal else h) - 1) * n
        k = min(int(t), n - 1)
        f = t - k
        col = tuple(int(stops[k][j] + (stops[k + 1][j] - stops[k][j]) * f) for j in range(3))
        for o in range(h if horizontal else w):
            px[(i, o) if horizontal else (o, i)] = col
    return g


def doc_icon(mark, size):
    """.folio document icon: a white sheet with a folded corner carrying the mark."""
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s = size / 1024
    sheet = [(220 * s, 64 * s), (656 * s, 64 * s), (828 * s, 236 * s), (828 * s, 960 * s), (196 * s, 960 * s), (196 * s, 64 * s)]
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon([(x, y + 10 * s) for x, y in sheet], fill=(20, 16, 60, 70))
    c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12 * s)))
    d = ImageDraw.Draw(c)
    d.polygon(sheet, fill=(255, 255, 255, 255), outline=(0, 0, 0, 40))
    d.polygon([(656 * s, 64 * s), (656 * s, 236 * s), (828 * s, 236 * s)], fill=(226, 228, 240, 255), outline=(0, 0, 0, 30))
    m = square(mark, int(480 * s), 0.02)
    c.alpha_composite(m, (int(512 * s - m.width / 2), int(330 * s)))
    return c


def main():
    src = Image.open(P('build/brand/logo-source.webp'))
    mark = cut_out(src)
    big = square(mark, 1024, 0.04)
    big.save(P('build/brand/logo-mark.png'))

    # in-app / web: the transparent mark
    os.makedirs(P('app/icons'), exist_ok=True)
    square(mark, 256, 0.02).save(P('app/icons/logo-mark.png'))
    b64 = base64.b64encode(open(P('app/icons/logo-mark.png'), 'rb').read()).decode()
    with open(P('app/icons/icon.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256">'
                f'<image width="256" height="256" href="data:image/png;base64,{b64}" xlink:href="data:image/png;base64,{b64}"/></svg>\n')
    square(mark, 192, 0.06).save(P('app/icons/icon-192.png'))
    square(mark, 512, 0.06).save(P('app/icons/icon-512.png'))
    tile(mark, 180, 0, pad=0.16).convert('RGB').save(P('app/icons/apple-touch-icon.png'))
    mk = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    mk.alpha_composite(square(mark, 512, 0.2))
    mk.save(P('app/icons/maskable-512.png'))
    with open(P('app/icons/maskable.svg'), 'w') as f:
        b = base64.b64encode(open(P('app/icons/maskable-512.png'), 'rb').read()).decode()
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,{b}"/></svg>\n')

    # app icon: Windows/Linux use the bare mark, macOS a rounded white tile
    square(mark, 1024, 0.04).save(P('build/icon.png'))
    ico = square(mark, 256, 0.02)
    ico.save(P('build/icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    mac = tile(mark, 1024, 185, inset=100, pad=0.17, shadow=True)
    mac.save(P('build/icon.icns'))

    # .folio document icons
    doc = doc_icon(mark, 1024)
    doc.save(P('build/folio.icns'))
    doc.resize((256, 256), Image.LANCZOS).save(P('build/folio.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # DMG window background (540×380 points; icons at (130, 200) and (410, 200))
    for scale, name in ((1, 'background.png'), (2, 'background@2x.png')):
        W, H = 540 * scale, 380 * scale
        bg = Image.new('RGB', (W, H), (248, 248, 252))
        bg.paste(gradient(W, 6 * scale), (0, 0))
        d = ImageDraw.Draw(bg)
        y = 200 * scale
        for x in range(205 * scale, 330 * scale, 10 * scale):
            d.ellipse((x - 2 * scale, y - 2 * scale, x + 2 * scale, y + 2 * scale), fill=(110, 90, 240))
        d.line((332 * scale, y - 12 * scale, 346 * scale, y, 332 * scale, y + 12 * scale), fill=(110, 90, 240), width=3 * scale, joint='curve')
        logo = square(mark, 64 * scale, 0.02)
        bg.paste(logo, ((W - logo.width) // 2, 40 * scale), logo)
        bg.save(P('build', name))

    # NSIS installer sidebar (164×314, 24-bit BMP)
    sb = gradient(164, 314, [(70, 40, 200), (40, 90, 240), (0, 190, 240)], horizontal=False)
    plate = Image.new('RGBA', (120, 120), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle((0, 0, 119, 119), 26, fill=(255, 255, 255, 255))
    plate.alpha_composite(square(mark, 120, 0.14))
    sb.paste(plate, (22, 40), plate)
    sb.save(P('build/installerSidebar.bmp'))
    print('Wrote icons from build/brand/logo-source.webp')


if __name__ == '__main__':
    main()
