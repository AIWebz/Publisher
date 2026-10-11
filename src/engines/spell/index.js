// Spelling and find/replace engine (see ARCHITECTURE.md, engines/spell).

export {
  createSpellChecker, getSpellChecker, peekSpellChecker, resetSpellChecker, fetchDictionaryLoader, MAX_SUGGESTIONS,
  spellcheckHtml, spellcheckDocument, applyCorrection, changeAll, createSpellingSession
} from './spell.js';
export { findAll, findInHtml, findInPlain, compileQuery, replaceMatch, replaceAll, replaceTextRange, expandReplacement } from './find.js';
export { collectTextTargets, targetKey, getTargetHtml, setTargetHtml } from './targets.js';
export {
  getPlainText, tokenizeHtml, serializeTokens, replacePlainRange, replaceTextInHtml, plainToHtml, rangeHasAtom, isFieldTag,
  escapeHtmlText, decodeTextRun
} from './html-text.js';
export { tokenizeWords } from './tokenizer.js';
