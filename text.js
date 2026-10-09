// src/text.js
var KANJI = /[㐀-鿿豈-﫿々〆ヵヶ]/;
var DIGIT = /[0-9０-９]/;
var isRubyChar = (c) => KANJI.test(c) || DIGIT.test(c);
var toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));
function furigana({ surface, reading }) {
  if (!reading || ![...surface].some(isRubyChar)) return [{ text: surface }];
  const hira = toHiragana(reading);
  const whole = [{ text: surface, reading: hira }];
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
function furiganaOf(words) {
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
function groupBunsetsu(words) {
  const groups = [];
  let cur = null;
  let attachNext = false;
  const start = (w) => {
    cur = { morphemes: [w] };
    groups.push(cur);
  };
  const add = (w) => cur ? cur.morphemes.push(w) : start(w);
  for (const w of words) {
    if (w.pos === "whitespace" || !w.surface.trim()) {
      cur = null;
      attachNext = false;
      continue;
    }
    const prev = cur?.morphemes.at(-1);
    if (w.tags.includes("bracket-open")) {
      start(w);
      attachNext = true;
      continue;
    }
    if (w.pos === "punctuation" || w.pos === "symbol") {
      add(w);
      attachNext = false;
      continue;
    }
    if (w.pos === "prefix") {
      start(w);
      attachNext = true;
      continue;
    }
    if (attachNext && cur) {
      cur.morphemes.push(w);
      attachNext = false;
      continue;
    }
    attachNext = false;
    if (w.pos === "particle" || w.pos === "auxiliary" || w.pos === "suffix") {
      add(w);
      continue;
    }
    if (cur && prev) {
      const helper = w.tags.includes("dependent") && (w.pos === "verb" || w.pos === "adjective") && (prev.pos === "verb" || prev.pos === "auxiliary" || prev.pos === "adjective" || prev.tags.includes("conjunctive"));
      const counter = w.pos === "noun" && (w.tags.includes("numeral") || w.tags.includes("counter")) && prev.tags.includes("numeral");
      const nameSuffix = w.pos === "noun" && [...w.surface].length === 1 && KANJI.test(w.surface) && prev.pos === "noun" && prev.tags.includes("proper");
      if (helper || counter || nameSuffix) {
        cur.morphemes.push(w);
        continue;
      }
    }
    start(w);
  }
  const NON_HEAD = /* @__PURE__ */ new Set(["particle", "auxiliary", "suffix", "punctuation", "symbol", "prefix"]);
  return groups.map(({ morphemes }) => {
    const i = morphemes.findIndex((w) => !NON_HEAD.has(w.pos));
    const head = i < 0 ? [morphemes[0]] : morphemes.slice(0, i + 1);
    return {
      morphemes,
      head,
      headDictionaryForm: head.map((w) => w.dictionaryForm || w.surface).join(""),
      start: morphemes[0].start,
      end: morphemes.at(-1).end
    };
  });
}
function splitSentences(text) {
  const ENDERS = "\u3002\uFF01\uFF1F!?\u2026", OPEN = "\u300C\u300E\uFF08(\uFF3B[\u3010", CLOSE = "\u300D\u300F\uFF09)\uFF3D]\u3011", QUOTES = `"\u201D\u2019'`;
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
    if (c === "\n") {
      flush(i);
      from = i + 1;
      continue;
    }
    if (OPEN.includes(c)) {
      depth++;
      continue;
    }
    if (CLOSE.includes(c)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const next = text[i + 1];
    const ender = ENDERS.includes(c) || c === "." && (next === void 0 || /\s/.test(next));
    if (!ender || depth > 0) continue;
    while (i + 1 < text.length && (ENDERS.includes(text[i + 1]) || CLOSE.includes(text[i + 1]) || QUOTES.includes(text[i + 1]) || text[i + 1] === ".")) i++;
    flush(i + 1);
  }
  flush(text.length);
  return out;
}
var POS_EN = {
  "\u540D\u8A5E": "Noun",
  "\u4EE3\u540D\u8A5E": "Pronoun",
  "\u52D5\u8A5E": "Verb",
  "\u5F62\u5BB9\u8A5E": "Adjective (\u3044-adj)",
  "\u5F62\u72B6\u8A5E": "Adjectival noun (\u306A-adj stem)",
  "\u526F\u8A5E": "Adverb",
  "\u9023\u4F53\u8A5E": "Pre-noun adjectival",
  "\u63A5\u7D9A\u8A5E": "Conjunction",
  "\u611F\u52D5\u8A5E": "Interjection",
  "\u52A9\u8A5E": "Particle",
  "\u52A9\u52D5\u8A5E": "Auxiliary verb",
  "\u63A5\u982D\u8F9E": "Prefix",
  "\u63A5\u5C3E\u8F9E": "Suffix",
  "\u88DC\u52A9\u8A18\u53F7": "Punctuation / symbol",
  "\u8A18\u53F7": "Symbol",
  "\u7A7A\u767D": "Whitespace",
  "\u30D5\u30A3\u30E9\u30FC": "Filler (um, uh)",
  "\u305D\u306E\u4ED6": "Other",
  "\u666E\u901A\u540D\u8A5E": "common noun",
  "\u56FA\u6709\u540D\u8A5E": "proper noun",
  "\u6570\u8A5E": "numeral",
  "\u4E00\u822C": "general",
  "\u526F\u8A5E\u53EF\u80FD": "can act as adverb",
  "\u52A9\u6570\u8A5E\u53EF\u80FD": "can act as counter",
  "\u30B5\u5909\u53EF\u80FD": "suru-verb capable",
  "\u30B5\u5909\u5F62\u72B6\u8A5E\u53EF\u80FD": "suru-verb / na-adj capable",
  "\u5F62\u72B6\u8A5E\u53EF\u80FD": "na-adjective capable",
  "\u975E\u81EA\u7ACB\u53EF\u80FD": "can be non-independent (auxiliary use)",
  "\u30BF\u30EA": "tari-type",
  "\u52A9\u52D5\u8A5E\u8A9E\u5E79": "auxiliary stem",
  "\u4FC2\u52A9\u8A5E": "binding particle (\u306F, \u3082)",
  "\u683C\u52A9\u8A5E": "case particle (\u304C, \u3092, \u306B)",
  "\u63A5\u7D9A\u52A9\u8A5E": "conjunctive particle (\u3066, \u3051\u3069)",
  "\u7D42\u52A9\u8A5E": "sentence-final particle (\u306D, \u3088)",
  "\u526F\u52A9\u8A5E": "adverbial particle (\u3060\u3051, \u307E\u3067)",
  "\u6E96\u4F53\u52A9\u8A5E": "nominalizing particle (\u306E, \u3093)",
  "\u9593\u6295\u52A9\u8A5E": "interjectory particle",
  "\u4E26\u7ACB\u52A9\u8A5E": "parallel particle (\u3068, \u3084)",
  "\u53E5\u70B9": "period",
  "\u8AAD\u70B9": "comma",
  "\u62EC\u5F27\u958B": "opening bracket",
  "\u62EC\u5F27\u9589": "closing bracket",
  "\uFF21\uFF21": "ASCII art",
  "\u9854\u6587\u5B57": "emoticon",
  "\u5730\u540D": "place name",
  "\u4EBA\u540D": "person name",
  "\u56FD": "country",
  "\u540D": "given name",
  "\u59D3": "family name",
  "\u7D44\u7E54\u540D": "organization",
  "\u656C\u8A9E": "honorific",
  "\u6587\u5B57": "character"
};
function posLabel(word, lang = "en") {
  const tags = (word.posDetail ?? []).slice(0, 2).filter((t) => t && t !== "*");
  return lang === "ja" ? tags.join("\u30FB") : tags.map((t) => POS_EN[t] ?? t).join(", ");
}
export {
  furigana,
  furiganaOf,
  groupBunsetsu,
  posLabel,
  splitSentences,
  toHiragana
};
