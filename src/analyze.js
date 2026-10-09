// Turns Sudachi's raw output into Morpheme objects, safely. Kept apart from the worker so it can be tested in Node.
//
// The old npm build of Sudachi crashed (a wasm trap) on one unknown word of 256+ bytes (long URLs, emoji runs); the
// build wakachi uses now doesn't. As a safety net, a piece that still traps is split in half and retried, down to
// single tiny pieces, so one odd stretch never loses the whole text.
import { splitInput, MAX_PIECE } from "./split-input.js";
import { sudachiPos } from "./pos.js";

const MODE_C = 2; // the longest units (選挙管理委員会 as one word), as wakachi has always used

/**
 * @param {(text: string, mode: number) => string} tokenize  the wasm-bindgen export
 * @returns {(text: string, alive?: () => void) => object[]}  analyzeText
 */
export function makeAnalyzeText(tokenize) {
  let traps = 0;

  /** Raw Sudachi morphemes for `text`, never throwing on a Sudachi trap. */
  function raw(text) {
    try {
      return JSON.parse(tokenize(text, MODE_C));
    } catch (err) {
      if (!(err instanceof WebAssembly.RuntimeError)) throw err;
      traps++;
      const cps = Array.from(text);
      if (cps.length <= 8) {
        return [{ surface: text, poses: ["その他", "*", "*", "*", "*", "*"], reading_form: "", dictionary_form: text, normalized_form: text }];
      }
      const half = cps.length >> 1;
      return [...raw(cps.slice(0, half).join("")), ...raw(cps.slice(half).join(""))];
    }
  }

  /**
   * Raw morphemes whose `surface` is the original text. Sudachi rewrites some characters in its output (e.g. ":" comes
   * back as "："). Usually one character becomes one character, so surfaces are mapped back by position. When the
   * counts differ (a character expanded or merged), the text is halved until they match.
   */
  function aligned(text) {
    const ms = raw(text);
    const src = Array.from(text);
    const lens = ms.map((m) => Array.from(m.surface).length);
    if (lens.reduce((a, b) => a + b, 0) === src.length) {
      let i = 0;
      return ms.map((m, k) => ({ ...m, surface: src.slice(i, (i += lens[k])).join("") }));
    }
    if (src.length <= 1) {
      const [first] = ms;
      return [{ ...first, surface: text, reading_form: ms.map((m) => m.reading_form).join(""), dictionary_form: text, normalized_form: ms.map((m) => m.normalized_form).join("") }];
    }
    const half = src.length >> 1;
    return [...aligned(src.slice(0, half).join("")), ...aligned(src.slice(half).join(""))];
  }

  /**
   * Words of many texts. Pieces (of all the texts) are sent to Sudachi together, joined by line breaks, in calls of
   * at most MAX_PIECE characters (Sudachi's memory grows with the size of one call and never shrinks), which saves the
   * round trips. Every character of a call is mapped back to its text and position; the joining line breaks are
   * dropped.
   */
  function analyzeTexts(texts, alive = () => {}) {
    const results = texts.map(() => []);
    // pieces: [text index, offset in that text, string]
    const pieces = [];
    texts.forEach((text, k) => {
      for (const piece of splitInput(text)) {
        pieces.push([k, piece.offset, piece.text]);
      }
    });
    let batch = [], size = 0;
    const flush = () => {
      if (batch.length) { runBatch(batch, results); alive(); }
      batch = []; size = 0;
    };
    for (const p of pieces) {
      if (size && size + 1 + p[2].length > MAX_PIECE) flush();
      batch.push(p);
      size += (size ? 1 : 0) + p[2].length;
    }
    flush();
    return results;
  }

  /** One Sudachi call for `batch`, its words appended to `results`. */
  function runBatch(batch, results) {
    // owner[i] / pos[i]: text and position of character i of the call; -1 for a joining line break
    const owner = [], pos = [];
    let joined = "";
    batch.forEach(([k, offset, part], n) => {
      if (n) { joined += "\n"; owner.push(-1); pos.push(-1); }
      joined += part;
      for (let i = 0; i < part.length; i++) { owner.push(k); pos.push(offset + i); }
    });
    let at = 0;
    for (const m of aligned(joined)) {
      const from = at;
      at += m.surface.length;
      // split the word where it changes text or skips a joining line break (only whitespace words can)
      let i = from;
      while (i < at) {
        while (i < at && owner[i] === -1) i++;
        if (i >= at) break;
        let j = i + 1;
        while (j < at && owner[j] === owner[i] && pos[j] === pos[j - 1] + 1) j++;
        const k = owner[i], start = pos[i], end = pos[j - 1] + 1;
        results[k].push({
          surface: joined.slice(i, j),
          reading: /[ァ-ヺ]/.test(m.reading_form) ? m.reading_form : "", // "" when there is none (Sudachi repeats symbols)
          dictionaryForm: m.dictionary_form,
          normalizedForm: m.normalized_form,
          ...sudachiPos(m.poses),
          posDetail: m.poses,
          start,
          end,
        });
        i = j;
      }
    }
  }

  /** Words of one text. */
  const analyzeText = (text, alive) => analyzeTexts([text], alive)[0];
  analyzeText.many = analyzeTexts;
  analyzeText.traps = () => traps;
  return analyzeText;
}
