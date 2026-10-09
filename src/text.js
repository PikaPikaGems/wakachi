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
 * @returns {{ surface: string, morphemes: object[], head: object[], headDictionaryForm: string, start: number, end: number }[]}
 */
export function groupBunsetsu(words) {
  const groups = [];
  let cur = null;
  let attachNext = false;
  const start = (w) => { cur = { morphemes: [w] }; groups.push(cur); };
  const add = (w) => (cur ? cur.morphemes.push(w) : start(w));

  for (const w of words) {
    if (w.pos === "空白" || !w.surface.trim()) { cur = null; attachNext = false; continue; }
    const prev = cur?.morphemes.at(-1);
    if (w.tags.includes("括弧開")) { start(w); attachNext = true; continue; }
    if (w.pos === "補助記号" || w.pos === "記号") { add(w); attachNext = false; continue; }
    if (w.pos === "接頭辞") { start(w); attachNext = true; continue; }
    if (attachNext && cur) { cur.morphemes.push(w); attachNext = false; continue; }
    attachNext = false;
    if (w.pos === "助詞" || w.pos === "助動詞" || w.pos === "接尾辞") { add(w); continue; }

    if (cur && prev) {
      // て + いる, 食べ + 始める: a helper verb/adjective continues a predicate
      const helper = w.tags.includes("非自立可能") && (w.pos === "動詞" || w.pos === "形容詞")
        && (prev.pos === "動詞" || prev.pos === "助動詞" || prev.pos === "形容詞" || prev.tags.includes("接続助詞"));
      // 5 + 分, 十 + 五
      const counter = w.pos === "名詞" && (w.tags.includes("数詞") || w.tags.includes("助数詞")) && prev.tags.includes("数詞");
      // 日本 + 語, 東京 + 都: a one-kanji noun right after a proper noun
      const nameSuffix = w.pos === "名詞" && [...w.surface].length === 1 && KANJI.test(w.surface) && prev.pos === "名詞" && prev.tags.includes("固有名詞");
      if (helper || counter || nameSuffix) { cur.morphemes.push(w); continue; }
    }
    start(w);
  }

  const NON_HEAD = new Set(["助詞", "助動詞", "接尾辞", "補助記号", "記号", "接頭辞"]);
  return groups.map(({ morphemes }) => {
    const i = morphemes.findIndex((w) => !NON_HEAD.has(w.pos));
    const head = i < 0 ? [morphemes[0]] : morphemes.slice(0, i + 1);
    return {
      surface: morphemes.map((w) => w.surface).join(""),
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

/**
 * English names for Sudachi's part-of-speech tags, levels 1 to 4 of `posDetail` (every tag SudachiDict uses there).
 * Checked against the English tagset for UniDic, whose tags Sudachi uses (Srdanovic, checked by Ogiso, Den and
 * Maekawa: gist.github.com/masayu-a/e3eee0637c07d4019ec9). Levels 5 and 6 (conjugation type and form) aren't here.
 */
export const POS_ENGLISH = Object.freeze({
  // first level: what `pos` holds
  "名詞": "noun", "代名詞": "pronoun", "動詞": "verb", "形容詞": "adjective (い)", "形状詞": "adjectival noun (な)",
  "副詞": "adverb", "連体詞": "adnominal", "接続詞": "conjunction", "感動詞": "interjection",
  "助詞": "particle", "助動詞": "auxiliary verb", "接頭辞": "prefix", "接尾辞": "suffix",
  "補助記号": "punctuation", "記号": "symbol", "空白": "whitespace", "その他": "other",
  // what `tags` can hold
  "固有名詞": "proper noun", "数詞": "numeral", "助数詞": "counter", "非自立可能": "can be bound (helper use)",
  "接続助詞": "conjunctive particle", "括弧開": "opening bracket", "括弧閉": "closing bracket",
  // other levels of posDetail
  "普通名詞": "common noun", "一般": "general", "フィラー": "filler",
  "副詞可能": "can be adverbial", "助数詞可能": "can be a counter", "サ変可能": "can take する",
  "サ変形状詞可能": "can take する or な", "形状詞可能": "can take な",
  "タリ": "tari-type", "助動詞語幹": "auxiliary stem",
  "名詞的": "noun-like", "動詞的": "verb-like", "形容詞的": "adjective-like (い)", "形状詞的": "adjectival-noun-like (な)",
  "係助詞": "binding particle (は, も)", "格助詞": "case particle (が, を, に)",
  "終助詞": "sentence-final particle (ね, よ)", "副助詞": "adverbial particle (だけ, まで)", "準体助詞": "nominal particle (の, ん)",
  "句点": "period", "読点": "comma", "ＡＡ": "ASCII art", "顔文字": "emoticon", "文字": "character",
  "地名": "place name", "人名": "person name", "国": "country", "名": "given name", "姓": "family name",
});

/** The English name of a part-of-speech tag: posInEnglish("名詞") → "noun", posInEnglish("固有名詞") → "proper noun". */
export const posInEnglish = (tag) => POS_ENGLISH[tag] ?? tag;

/** "動詞・一般" (lang "ja", the default) or "verb, general" ("en"), from the word's first two Sudachi tags. */
export function posLabel(word, lang = "ja") {
  const tags = (word.posDetail ?? []).slice(0, 2).filter((t) => t && t !== "*");
  return lang === "ja" ? tags.join("・") : tags.map(posInEnglish).join(", ");
}
