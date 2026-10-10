// STUB — replaced by the text engine (linked-frame flow, columns, overflow, autofit).
// Contract:
//   layoutStories(doc, opts) -> Map<frameId, { html, overflow, scale, contentHeight }>
//     opts.resolveField(name, frame) -> string|null   value for merge/page fields in that frame
//     opts.frames (optional) restricts layout to the chains containing these frame ids
//   For each chain of linked text frames (model.getChain), the story HTML is flowed through the
//   frames in order; `html` is the fragment shown in that frame, `overflow` is true on the last
//   frame of a chain whose text does not fit, `scale` is the autofit font scale (1 = none).
//   invalidateLayout() clears caches (call after fonts load).
import { allElements, getChain } from '../../core/model.js';
import { substituteFields } from './fields.js';

export function layoutStories(doc, opts = {}) {
  const out = new Map();
  const seen = new Set();
  for (const f of allElements(doc, 'text')) {
    if (seen.has(f.id)) continue;
    const chain = getChain(doc, f.id);
    chain.forEach((fr, i) => {
      seen.add(fr.id);
      const story = doc.stories[fr.storyId];
      const html = i === 0 && story ? substituteFields(story.html, (n) => (opts.resolveField ? opts.resolveField(n, fr) : null)) : '';
      out.set(fr.id, { html, overflow: false, scale: 1, contentHeight: 0 });
    });
  }
  return out;
}

export function invalidateLayout() {}
