// wakachi/text: pure functions on the results of analyze(). No worker, no dictionary. See API.md §9.

const KANJI = /[㐀-鿿豈-﫿々〆ヵヶ]/;
const DIGIT = /[0-9０-９]/;
const isRubyChar = (c) => KANJI.test(c) || DIGIT.test(c);

/** Katakana to hiragana ("ネコ" → "ねこ"); everything else is left as is. */
export const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * Furigana for one word: the reading (hiragana) sits on its kanji and numbers; kana next to them (okurigana) is
 * left alone. 食べ (タベ) → [{ text: "食", reading: "た" }, { text: "べ" }]. Joining every `text` gives the surface.
 * When the kana can't be lined up with the reading, the whole word gets one reading.
 * @param {{ surface: string, reading: string }} word
 * @returns {{ text: string, reading?: string }[]}
 */
export function furigana({ surface, reading }) {
  if (!reading || ![...surface].some(isRubyChar)) return [{ text: surface }];
  const hira = toHiragana(reading);
  const whole = [{ text: surface, reading: hira }];

  // alternating runs of kanji/digits (k) and everything else
  const runs = [];
  for (const ch of surface) {
    const k = isRubyChar(ch);
    const last = runs.at(-1);
    if (last && last.k === k) last.text += ch;
    else runs.push({ k, text: ch });
  }

  const out = [];
  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!run.k) {
      const h = toHiragana(run.text);
      if (!hira.startsWith(h, pos)) return whole;
      out.push({ text: run.text });
      pos += h.length;
    } else {
      const next = runs[i + 1];
      const end = next ? hira.indexOf(toHiragana(next.text), pos + 1) : hira.length;
      if (end <= pos) return whole;
      out.push({ text: run.text, reading: hira.slice(pos, end) });
      pos = end;
    }
  }
  return pos === hira.length ? out : whole;
}

/** Furigana for a whole analysis: the words' furigana joined, plain pieces next to each other merged. */
export function furiganaOf(words) {
  const out = [];
  for (const w of words) {
    for (const seg of furigana(w)) {
      const last = out.at(-1);
      if (!seg.reading && last && !last.reading) last.text += seg.text;
      else out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Bunsetsu (文節): one independent word (noun, verb, adjective, ...) with the particles, auxiliaries and suffixes
 * that follow it. Sudachi doesn't find these, so this is approximate (part-of-speech rules): compound nouns and some
 * verb chains occasionally split or merge oddly. Whitespace ends a group and isn't part of any.
 * @returns {{ morphemes: object[], head: object[], headDictionaryForm: string, start: number, end: number }[]}
 */
export function groupBunsetsu(words) {
  const groups = [];
  let cur = null;
  let attachNext = false;
  const start = (w) => { cur = { morphemes: [w] }; groups.push(cur); };
  const add = (w) => (cur ? cur.morphemes.push(w) : start(w));

  for (const w of words) {
    if (w.pos === "whitespace" || !w.surface.trim()) { cur = null; attachNext = false; continue; }
    const prev = cur?.morphemes.at(-1);
    if (w.tags.includes("bracket-open")) { start(w); attachNext = true; continue; }
    if (w.pos === "punctuation" || w.pos === "symbol") { add(w); attachNext = false; continue; }
    if (w.pos === "prefix") { start(w); attachNext = true; continue; }
    if (attachNext && cur) { cur.morphemes.push(w); attachNext = false; continue; }
    attachNext = false;
    if (w.pos === "particle" || w.pos === "auxiliary" || w.pos === "suffix") { add(w); continue; }

    if (cur && prev) {
      // て + いる, 食べ + 始める: a helper verb/adjective continues a predicate
      const helper = w.tags.includes("dependent") && (w.pos === "verb" || w.pos === "adjective")
        && (prev.pos === "verb" || prev.pos === "auxiliary" || prev.pos === "adjective" || prev.tags.includes("conjunctive"));
      // 5 + 分, 十 + 五
      const counter = w.pos === "noun" && (w.tags.includes("numeral") || w.tags.includes("counter")) && prev.tags.includes("numeral");
      // 日本 + 語, 東京 + 都: a one-kanji noun right after a proper noun
      const nameSuffix = w.pos === "noun" && [...w.surface].length === 1 && KANJI.test(w.surface) && prev.pos === "noun" && prev.tags.includes("proper");
      if (helper || counter || nameSuffix) { cur.morphemes.push(w); continue; }
    }
    start(w);
  }

  const NON_HEAD = new Set(["particle", "auxiliary", "suffix", "punctuation", "symbol", "prefix"]);
  return groups.map(({ morphemes }) => {
    const i = morphemes.findIndex((w) => !NON_HEAD.has(w.pos));
    const head = i < 0 ? [morphemes[0]] : morphemes.slice(0, i + 1);
    return {
      morphemes,
      head,
      headDictionaryForm: head.map((w) => w.dictionaryForm || w.surface).join(""),
      start: morphemes[0].start,
      end: morphemes.at(-1).end,
    };
  });
}

/**
 * Sentences, with their positions in `text`. Breaks after 。！？!?… (and "." followed by a space or the end, so
 * "3.14" stays whole), plus any closing quotes after them, and at line breaks. Enders inside 「」『』（）() stay put,
 * so 「行こう！」と彼は言った。 is one sentence. Surrounding spaces are left out; empty lines give nothing.
 * @returns {{ text: string, start: number, end: number }[]}
 */
export function splitSentences(text) {
  const ENDERS = "。！？!?…", OPEN = "「『（(［[【", CLOSE = "」』）)］]】", QUOTES = "\"”’'";
  const out = [];
  let from = 0, depth = 0;
  const flush = (to) => {
    const piece = text.slice(from, to);
    const lead = piece.length - piece.trimStart().length;
    const t = piece.trim();
    if (t) out.push({ text: t, start: from + lead, end: from + lead + t.length });
    from = to;
    depth = 0;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") { flush(i); from = i + 1; continue; }
    if (OPEN.includes(c)) { depth++; continue; }
    if (CLOSE.includes(c)) { depth = Math.max(0, depth - 1); continue; }
    const next = text[i + 1];
    const ender = ENDERS.includes(c) || (c === "." && (next === undefined || /\s/.test(next)));
    if (!ender || depth > 0) continue;
    while (i + 1 < text.length && (ENDERS.includes(text[i + 1]) || CLOSE.includes(text[i + 1]) || QUOTES.includes(text[i + 1]) || text[i + 1] === ".")) i++;
    flush(i + 1);
  }
  flush(text.length);
  return out;
}

const POS_EN = {
  "名詞": "Noun", "代名詞": "Pronoun", "動詞": "Verb", "形容詞": "Adjective (い-adj)", "形状詞": "Adjectival noun (な-adj stem)",
  "副詞": "Adverb", "連体詞": "Pre-noun adjectival", "接続詞": "Conjunction", "感動詞": "Interjection",
  "助詞": "Particle", "助動詞": "Auxiliary verb", "接頭辞": "Prefix", "接尾辞": "Suffix",
  "補助記号": "Punctuation / symbol", "記号": "Symbol", "空白": "Whitespace", "フィラー": "Filler (um, uh)", "その他": "Other",
  "普通名詞": "common noun", "固有名詞": "proper noun", "数詞": "numeral", "一般": "general",
  "副詞可能": "can act as adverb", "助数詞可能": "can act as counter", "サ変可能": "suru-verb capable",
  "サ変形状詞可能": "suru-verb / na-adj capable", "形状詞可能": "na-adjective capable",
  "非自立可能": "can be non-independent (auxiliary use)", "タリ": "tari-type", "助動詞語幹": "auxiliary stem",
  "係助詞": "binding particle (は, も)", "格助詞": "case particle (が, を, に)", "接続助詞": "conjunctive particle (て, けど)",
  "終助詞": "sentence-final particle (ね, よ)", "副助詞": "adverbial particle (だけ, まで)", "準体助詞": "nominalizing particle (の, ん)",
  "間投助詞": "interjectory particle", "並立助詞": "parallel particle (と, や)",
  "句点": "period", "読点": "comma", "括弧開": "opening bracket", "括弧閉": "closing bracket", "ＡＡ": "ASCII art", "顔文字": "emoticon",
  "地名": "place name", "人名": "person name", "国": "country", "名": "given name", "姓": "family name", "組織名": "organization",
  "敬語": "honorific", "文字": "character",
};

/** "Verb, general" (lang "en", the default) or "動詞・一般" ("ja"), from the word's first two Sudachi tags. */
export function posLabel(word, lang = "en") {
  const tags = (word.posDetail ?? []).slice(0, 2).filter((t) => t && t !== "*");
  return lang === "ja" ? tags.join("・") : tags.map((t) => POS_EN[t] ?? t).join(", ");
}
