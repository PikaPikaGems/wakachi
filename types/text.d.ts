// Types for "wakachi/text": pure helpers on the results of analyze(). See API.md §9.
import type { Morpheme, RubySegment } from "./index.js";

export type { RubySegment };

export interface Bunsetsu {
  morphemes: Morpheme[];
  /** Leading prefix(es) + the first content word, e.g. [食べ] in 食べ|させ|られ|た. */
  head: Morpheme[];
  /** Dictionary form of the head, e.g. 食べる. */
  headDictionaryForm: string;
  start: number;
  end: number;
}

/** Furigana for one word: 食べ (タベ) → [{ text: "食", reading: "た" }, { text: "べ" }]. */
export declare function furigana(word: Pick<Morpheme, "surface" | "reading">): RubySegment[];
/** Furigana for a whole analysis, plain pieces merged: what analyzer.furigana() returns. */
export declare function furiganaOf(words: Pick<Morpheme, "surface" | "reading">[]): RubySegment[];
/** Bunsetsu (approximate, from part-of-speech rules). Whitespace ends a group and belongs to none. */
export declare function groupBunsetsu(words: Morpheme[]): Bunsetsu[];
/** Sentences with their positions in `text`; 「行こう！」と彼は言った。 stays one sentence. */
export declare function splitSentences(text: string): { text: string; start: number; end: number }[];
/** Katakana to hiragana. */
export declare function toHiragana(text: string): string;
/** "動詞・一般" ("ja", default) or "verb, general" ("en"), from the word's first two Sudachi tags. */
export declare function posLabel(word: Pick<Morpheme, "posDetail">, lang?: "ja" | "en"): string;
/** English name of a part-of-speech tag: posInEnglish("名詞") → "noun", posInEnglish("固有名詞") → "proper noun". */
export declare function posInEnglish(tag: string): string;
/** The English names posInEnglish() uses, for all of Sudachi's tag levels. */
export declare const POS_ENGLISH: Readonly<Record<string, string>>;
