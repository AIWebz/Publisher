// Picture import: read files/blobs as data URLs, measure them, and downscale only when they are
// larger than MAX_IMAGE_PX on the long side (originals are kept otherwise).

export const MAX_IMAGE_PX = 4000;

/** Read a Blob/File as a data: URL. */
export function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Could not read the file'));
    r.readAsDataURL(blob);
  });
}

/** Load an image element from a URL. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be opened'));
    img.src = src;
  });
}

/** Target size for a picture of w×h so that the long side is at most `max`. */
export function fitWithin(w, h, max = MAX_IMAGE_PX) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: k < 1 };
}

/**
 * Prepare an image file for the document: { name, mime, data, width, height }.
 * @param {Blob & { name?: string }} file
 */
export async function prepareImage(file) {
  const mime = file.type || 'image/png';
  if (!/^image\//.test(mime)) throw new Error(`${file.name || 'That file'} is not a picture`);
  const data = await readAsDataURL(file);
  const img = await loadImage(data);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (/svg/.test(mime)) {
    if (!w || !h) { w = 300; h = 300; }
    return { name: file.name || 'picture.svg', mime, data, width: w, height: h };
  }
  const t = fitWithin(w, h);
  if (!t.scaled || /gif/.test(mime)) return { name: file.name || 'picture', mime, data, width: w, height: h };
  const c = document.createElement('canvas');
  c.width = t.w; c.height = t.h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, t.w, t.h);
  const keepPng = mime === 'image/png' || mime === 'image/webp';
  const outMime = keepPng ? 'image/png' : 'image/jpeg';
  return { name: file.name || 'picture', mime: outMime, data: c.toDataURL(outMime, 0.92), width: t.w, height: t.h };
}

/** Open the system file chooser for pictures. Resolves File[] (empty when cancelled). */
export function pickImageFiles({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp';
    input.multiple = multiple;
    input.style.display = 'none';
    let done = false;
    const finish = (files) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish([...(input.files || [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Size (w, h) for placing a w×h picture on a page: at most `frac` of the page, never upscaled. */
export function placementSize(w, h, pageW, pageH, frac = 0.6) {
  const k = Math.min(1, (pageW * frac) / w, (pageH * frac) / h);
  return { w: Math.max(8, Math.round(w * k)), h: Math.max(8, Math.round(h * k)) };
}
