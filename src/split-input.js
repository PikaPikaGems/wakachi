// Splits long input into pieces before it reaches an engine.
//
// Engine memory (wasm linear memory) never shrinks: one 50,000-character call grows Sudachi from 150 MB to 234 MB,
// 200,000 characters to 534 MB, and it stays there. Up to 8,000 characters per call it stays at ~150 MB (16,000:
// 164 MB). Each call also costs ~100 ms however short it is, so pieces are as big as that allows.
// Cuts are made after a sentence end or line break when possible, so the analysis matches a single call.

export const MAX_PIECE = 8000;

const ENDERS = "。．！？!?\n";
const CLOSERS = "」』）)］]】〉》\"”’'";

/**
 * @param {string} text
 * @param {number} [max]
 * @returns {{ text: string, offset: number }[]}  pieces in order; joined they are exactly `text`
 */
export function splitInput(text, max = MAX_PIECE) {
  if (text.length <= max) return [{ text, offset: 0 }];
  const pieces = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      let cut = -1;
      // the last sentence end in the second half of the window, plus any closing quotes/brackets after it
      for (let i = end - 1; i >= start + max / 2; i--) {
        if (ENDERS.includes(text[i])) {
          cut = i + 1;
          while (cut < end && CLOSERS.includes(text[cut])) cut++;
          break;
        }
      }
      if (cut > 0) end = cut;
      else {
        // no sentence end: cut anywhere, but never between the two halves of a surrogate pair (𠮷)
        const c = text.charCodeAt(end - 1);
        if (c >= 0xd800 && c <= 0xdbff) end--;
      }
    }
    pieces.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return pieces;
}
