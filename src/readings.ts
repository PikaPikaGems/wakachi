// Reading fixes, applied on the page to what Sudachi returns (pure functions, tested in Node).
//
// everydayReadings (on by default):
//   - words where Sudachi's dictionary prefers a formal or rare reading (私 わたくし → わたし, 明日 あす → あした...),
//     found by comparing Sudachi with the 10,000 most frequent words (PikaPikaGems/jp-word-ranks-data)
//   - numbers: Sudachi reads digits one at a time (10 → いちれい) and leaves out sound changes (一回 いちかい,
//     4日 よんか). A run of digits / kanji numerals becomes ONE word with the reading of the whole number, and the
//     counter after it gets its sound change (10月 じゅうがつ, 一回 いっかい, 3本 さんぼん, 20日 はつか)
// readings (the app's own): { "私": "わたくし" }, applied last. A key may span several words; they become one.
//
// Readings stay katakana (like Sudachi's); keys and values may be given in either kana.

import type { Morpheme, AnalyzerOptions } from "./types.js";

const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// ------------------------------------------------------------------------------------------------ words

/** Same surface, any context. */
const WORDS: Record<string, string> = {
  "私": "ワタシ", "明日": "アシタ", "日本": "ニホン", "一度": "イチド", "何人": "ナンニン", "何分": "ナンプン", "上手": "ジョウズ",
  "或いは": "アルイハ", "若しくは": "モシクハ", "所謂": "イワユル", "煩い": "ウルサイ", "不味い": "マズイ",
};

const FAMILY: Record<string, string> = { "父": "トウ", "母": "カア", "兄": "ニイ", "姉": "ネエ" };
const FAMILY_AFTER = new Set(["さん", "ちゃん", "様", "さま"]);
const NANI_BEFORE = new Set(["か", "も", "が", "を", "に", "から", "まで", "より", "それ", "これ", "あれ", "一つ"]);
// Words before 人 / 所 / 中 that change its reading (from jp-word-ranks-data; the others keep Sudachi's にん, しょ, ちゅう:
// 管理人, 事務所, 会議中)
const JIN_AFTER = new Set(["社会", "宇宙", "有名", "地球", "芸能", "異邦", "一般", "現代", "異星", "知識", "民間", "英", "著名", "個々",
  "欧米", "未来", "日系", "西洋", "野蛮", "県", "原始", "自由", "文化", "火星", "外国", "日本"]);
const JO_AFTER = new Set(["研究", "相談", "停留", "保健", "出張", "派出", "診療", "収容", "洗面", "発行", "教習", "興信", "脱衣",
  "避難", "取引", "造船", "検問", "印刷", "養成", "留置", "観測", "撮影"]);
const JUU_AFTER = new Set(["世界", "一日", "日本", "一晩", "身体", "顔", "一年", "国", "村"]);
const SHI_BEFORE = new Set(["生活", "立", "有", "鉄", "服", "物", "用", "事", "的", "情", "心", "欲", "費", "見", "設", "邸", "語", "利", "怨", "財"]);
// 日本 stays にっぽん in these names (日本銀行, 大日本帝国, 近畿日本鉄道...)
const NIPPON_BEFORE = new Set(["銀行", "生命", "通運", "電気", "帝国", "放送", "鉄道", "武道館", "橋"]);
const NIPPON_AFTER = new Set(["大", "近畿", "全"]);
const GAISHA_AFTER = new Set(["株式", "子", "親", "合同", "合資", "有限", "関連"]);

/** The next / previous word; null at the ends and across whitespace (a space or line break separates words). */
const neighbour = (w: Morpheme | undefined) => (w && w.pos !== "空白" ? w : null);
const nextWord = (ws: Morpheme[], i: number) => neighbour(ws[i + 1]);
const prevWord = (ws: Morpheme[], i: number) => neighbour(ws[i - 1]);

function fixWord(ws: Morpheme[], i: number) {
  const w = ws[i];
  const next = nextWord(ws, i), prev = prevWord(ws, i);
  // 私: only Sudachi's わたくし becomes わたし (私生活 stays し); 私ども, 私め are humble, わたくし is right
  // 私生活, 私立, 私鉄: し in compounds
  if (w.surface === "私" && SHI_BEFORE.has((next?.surface ?? ""))) return "シ";
  if (w.surface === "私") return w.reading === "ワタクシ" && !["ども", "め"].includes((next?.surface ?? "")) ? "ワタシ" : null;
  if (w.surface === "日本" && (NIPPON_BEFORE.has((next?.surface ?? "")) || NIPPON_AFTER.has((prev?.surface ?? "")))) return null;
  if (WORDS[w.surface] && w.reading) return WORDS[w.surface];
  // 言う: Sudachi says ゆう (言う, と言う); 言っ / 言わ are already いっ / いわ
  if (w.dictionaryForm === "言う" && w.reading.startsWith("ユ")) return `イ${w.reading.slice(1)}`;
  // (お)父さん, 母ちゃん, 兄さん, 姉様...
  if (FAMILY[w.surface] && next && FAMILY_AFTER.has(next.surface)) return FAMILY[w.surface];
  // 何か, 何も, 何が: なに (なん stays before counters and in 何で, 何の, 何だ)
  // (何にしても, 何にせよ stay なん)
  if (w.surface === "何" && w.reading === "ナン" && next && NANI_BEFORE.has(next.surface)
    && !(next.surface === "に" && ["し", "せよ"].includes((nextWord(ws, ws.indexOf(next))?.surface ?? "")))) return "ナニ";
  // the word before, also with the one before it (一日中: 一 + 日)
  const before = prev ? [prev.surface, (prevWord(ws, ws.indexOf(prev))?.surface ?? "") + prev.surface] : [];
  const after = (set: Set<string>) => before.some((b) => set.has(b));
  // 日本人, 社会人, アメリカ人: じん after a place and some nouns
  if (w.surface === "人" && w.reading === "ニン" && prev && (prev.posDetail[2] === "地名" || after(JIN_AFTER))) return "ジン";
  // 研究所: じょ
  if (w.surface === "所" && w.reading === "ショ" && after(JO_AFTER)) return "ジョ";
  // 世界中, 一日中: じゅう ("throughout"; 会議中 stays ちゅう)
  if (w.surface === "中" && w.reading === "チュウ" && after(JUU_AFTER)) return "ジュウ";
  // 株式会社, 保険会社: がいしゃ after a noun
  if (w.surface === "会社" && prev && (GAISHA_AFTER.has(prev.surface) || (prev.pos === "名詞" && !prev.tags.includes("数詞")) || prev.pos === "接頭辞")) return "ガイシャ";
  // 予定通り, いつも通り, 今まで通り: どおり (その通り, 言う通り stay とおり)
  if (w.surface === "通り" && w.reading === "トオリ" && prev && (["名詞", "代名詞", "副詞", "接尾辞"].includes(prev.pos) || prev.surface === "まで")) return "ドオリ";
  // 誕生日, 金曜日
  if (w.surface === "日" && ((prev?.surface ?? "") === "誕生" || prev?.surface.endsWith("曜"))) return "ビ";
  // 気に入る: いる, not はいる
  if (w.dictionaryForm === "入る" && w.reading.startsWith("ハイ") && (prev?.surface ?? "") === "に" && prevWord(ws, ws.indexOf(prev!))?.surface === "気") return w.reading.slice(1);
  // 一日 / 1日: ついたち only after a month (4月1日), else いちにち (一日中, 1日に3回)
  if (/^[1１一]日$/.test(w.surface) && w.reading === "ツイタチ" && (prev?.surface ?? "") !== "月") return "イチニチ";
  return null;
}

// ------------------------------------------------------------------------------------------------ numbers

const ONES = ["", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュウ"];
const DIGIT_SPOKEN = ["ゼロ", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュウ"];
const KANJI_DIGIT: Record<string, number> = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const KANJI_SMALL: Record<string, number> = { "十": 10, "百": 100, "千": 1000 };
const KANJI_BIG: Record<string, number> = { "万": 1e4, "億": 1e8, "兆": 1e12 };
const isDigitText = (s: string) => /^[0-9０-９]+$/.test(s);
// Sudachi gives digits as one word ("10", "1,000", "3.14") or (older builds) one word per digit
const isNumeralWord = (w: Morpheme) => w.tags.includes("数詞") && w.surface !== "何"
  && (/^[0-9０-９][0-9０-９,，.．]*$/.test(w.surface) || /^[〇零一二三四五六七八九十百千万億兆]+$/.test(w.surface));
const D = "[0-9０-９]";
const NUMBER_TEXT = new RegExp(`^(${D}{1,3}([,，]${D}{3})+|${D}+)([.．]${D}+)?$`); // 12, 1,000, 3.14, 1,234.5
const halfWidth = (s: string) => s.replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** Value of a number written with digits and/or kanji numerals ("10", "三十五", "二〇二六", "3万"); null if unsure. */
export function parseNumber(s: string): number | null {
  s = halfWidth(s).replace(/,/g, "");
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (/^[〇零一二三四五六七八九]+$/.test(s) && s.length > 1) {
    // 二〇二六 is a year; 二三 is "two or three"
    return /[〇零]/.test(s) ? Number([...s].map((c) => KANJI_DIGIT[c]).join("")) : null;
  }
  let total = 0, section = 0, buf: number | null = null;
  for (const c of s) {
    if (/[0-9]/.test(c)) buf = (buf ?? 0) * 10 + Number(c);
    else if (c in KANJI_DIGIT) buf = (buf ?? 0) * 10 + KANJI_DIGIT[c];
    else if (c in KANJI_SMALL) { section += (buf ?? 1) * KANJI_SMALL[c]; buf = null; }
    else if (c in KANJI_BIG) { total += (section + (buf ?? 0) || 1) * KANJI_BIG[c]; section = 0; buf = null; }
    else return null;
  }
  const n = total + section + (buf ?? 0);
  return Number.isSafeInteger(n) ? n : null;
}

/** 0–9999 as spoken pieces: 3608 → ["サンゼン", "ロッピャク", "ハチ"]. */
function smallPieces(n: number): string[] {
  const out = [];
  const [th, hu, te, on] = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  if (th) out.push(({ 1: "セン", 3: "サンゼン", 8: "ハッセン" } as Record<number, string>)[th] ?? `${ONES[th]}セン`);
  if (hu) out.push(({ 1: "ヒャク", 3: "サンビャク", 6: "ロッピャク", 8: "ハッピャク" } as Record<number, string>)[hu] ?? `${ONES[hu]}ヒャク`);
  if (te) out.push(te === 1 ? "ジュウ" : `${ONES[te]}ジュウ`);
  if (on) out.push(ONES[on]);
  return out;
}

/** A whole number as spoken pieces; the last piece is the one counters change. 0 → ["ゼロ"]. */
export function numberPieces(n: number): string[] {
  if (n === 0) return ["ゼロ"];
  const out = [];
  for (const [unit, name] of [[1e12, "チョウ"], [1e8, "オク"], [1e4, "マン"]] as const) {
    const k = Math.floor(n / unit) % 1e4;
    if (k) out.push(...smallPieces(k), name);
  }
  out.push(...smallPieces(n % 1e4));
  if (out[0] === "イチ" && out[1] === "チョウ") out[0] = "イッ";
  return out;
}

// Counters and the sound changes they cause. gem: the number's last piece is cut short (イチ → イッ) for these
// last pieces; h: how the counter's own ハ-row sound changes (p after a cut-short number, and after ン if "p" / "b").
const GEM_KST = ["イチ", "ハチ", "ジュウ"];               // 1, 8, 10: いっさい, はっさつ, じゅっこ
const GEM_K = [...GEM_KST, "ロク", "ヒャク"];               // + 6, 100 before か-row: ろっかい, ひゃっこ
interface CounterRule { gem?: string[]; h?: "p" | "b"; pAfterYon?: boolean; afterN?: string; four?: string; seven?: string; nine?: string }
const COUNTERS: Record<string, CounterRule> = {
  // か-row
  "回": { gem: GEM_K }, "個": { gem: GEM_K }, "階": { gem: GEM_K, afterN: "ガイ" }, "課": { gem: GEM_K },
  "ヶ月": { gem: GEM_K }, "か月": { gem: GEM_K }, "カ月": { gem: GEM_K }, "ケ月": { gem: GEM_K }, "箇月": { gem: GEM_K },
  "曲": { gem: GEM_K }, "件": { gem: GEM_K }, "軒": { gem: GEM_K, afterN: "ゲン" }, "校": { gem: GEM_K },
  // さ / た-row
  "歳": { gem: GEM_KST }, "才": { gem: GEM_KST }, "冊": { gem: GEM_KST }, "週": { gem: GEM_KST }, "週間": { gem: GEM_KST },
  "通": { gem: GEM_KST }, "着": { gem: GEM_KST }, "頭": { gem: GEM_KST }, "点": { gem: GEM_KST }, "足": { gem: GEM_KST },
  // は-row: いっぽん, さんぼん, よんほん; いっぷん, さんぷん, よんぷん
  "本": { gem: GEM_K, h: "b" }, "杯": { gem: GEM_K, h: "b" }, "匹": { gem: GEM_K, h: "b" },
  "分": { gem: GEM_K, h: "p", pAfterYon: true }, "泊": { gem: GEM_K, h: "p" }, "発": { gem: GEM_K, h: "p" },
  "歩": { gem: GEM_K, h: "p" }, "票": { gem: GEM_K, h: "p" }, "品": { gem: GEM_K, h: "p" },
  // no sound change, but よ / し / く for 4, 7, 9
  "時": { four: "ヨ", seven: "シチ", nine: "ク" }, "時間": { four: "ヨ" }, "年": { four: "ヨ" }, "円": { four: "ヨ" },
  "月": { four: "シ", seven: "シチ", nine: "ク" }, "人": { four: "ヨ" },
};
const BASE: Record<string, string> = { "回": "カイ", "個": "コ", "階": "カイ", "課": "カ", "ヶ月": "カゲツ", "か月": "カゲツ", "カ月": "カゲツ", "ケ月": "カゲツ",
  "箇月": "カゲツ", "曲": "キョク", "件": "ケン", "軒": "ケン", "校": "コウ", "歳": "サイ", "才": "サイ", "冊": "サツ", "週": "シュウ",
  "週間": "シュウカン", "通": "ツウ", "着": "チャク", "頭": "トウ", "点": "テン", "足": "ソク", "本": "ホン", "杯": "ハイ", "匹": "ヒキ",
  "分": "フン", "泊": "ハク", "発": "ハツ", "歩": "ホ", "票": "ヒョウ", "品": "ヒン", "時": "ジ", "時間": "ジカン", "年": "ネン",
  "円": "エン", "月": "ガツ", "人": "ニン" };
const H_TO: Record<"b" | "p", Record<string, string>> = { b: { "ハ": "バ", "ヒ": "ビ", "フ": "ブ", "ヘ": "ベ", "ホ": "ボ" }, p: { "ハ": "パ", "ヒ": "ピ", "フ": "プ", "ヘ": "ペ", "ホ": "ポ" } };

// Whole words: number + counter read as one (they become one word, so furigana spans both)
const DAYS: Record<number, string> = { 1: "ツイタチ", 2: "フツカ", 3: "ミッカ", 4: "ヨッカ", 5: "イツカ", 6: "ムイカ", 7: "ナノカ", 8: "ヨウカ", 9: "ココノカ", 10: "トオカ", 14: "ジュウヨッカ", 20: "ハツカ", 24: "ニジュウヨッカ" };
const TSU: Record<number, string> = { 1: "ヒトツ", 2: "フタツ", 3: "ミッツ", 4: "ヨッツ", 5: "イツツ", 6: "ムッツ", 7: "ナナツ", 8: "ヤッツ", 9: "ココノツ" };
const PEOPLE: Record<number, string> = { 1: "ヒトリ", 2: "フタリ" };

const CUT: Record<string, string> = { "イチ": "イッ", "ロク": "ロッ", "ハチ": "ハッ", "ジュウ": "ジュッ", "ヒャク": "ヒャッ" };

/**
 * Readings for a number (pieces from numberPieces, or ["ナン"] for 何) followed by a counter.
 * @returns {{ number: string, counter: string } | { whole: string } | null}  null: no rule for this counter
 */
export function countReading(n: number | null, pieces: string[], counter: string, { afterMonth = false, afterDai = false } = {}): { number: string; counter: string } | { whole: string } | null {
  if (counter === "日" && n != null) {
    if (n === 1 && !afterMonth) return { number: "イチ", counter: "ニチ" };
    if (DAYS[n]) return { whole: DAYS[n] };
    const ones = n % 10;
    const last = ones === 7 ? "シチ" : ones === 9 ? "ク" : pieces.at(-1); // 17日 じゅうしちにち, 29日 にじゅうくにち
    return { number: pieces.slice(0, -1).join("") + last, counter: "ニチ" };
  }
  if (counter === "つ" && TSU[n!]) return { whole: TSU[n!] };
  if (counter === "人" && PEOPLE[n!] && !afterDai) return { whole: PEOPLE[n!] }; // 第一人者: いちにん
  if ((counter === "歳" || counter === "才") && n === 20) return { whole: "ハタチ" };
  const rule = COUNTERS[counter];
  if (!rule) return null;
  const head = pieces.slice(0, -1).join("");
  let last = pieces.at(-1)!;
  let reading = BASE[counter];
  const ones = n != null && n % 10 !== 0 && pieces.at(-1) === ONES[n % 10];
  if (ones && n! % 10 === 4 && rule.four) last = rule.four;
  if (ones && n! % 10 === 7 && rule.seven) last = rule.seven;
  if (ones && n! % 10 === 9 && rule.nine) last = rule.nine;
  const cut = rule.gem && CUT[Object.keys(CUT).find((k) => last.endsWith(k) && rule.gem!.includes(k)) ?? ""];
  if (cut) {
    last = last.slice(0, last.length - (Object.keys(CUT).find((k) => last.endsWith(k)))!.length) + cut;
    if (rule.h) reading = (H_TO.p[reading[0]] ?? reading[0]) + reading.slice(1);
  } else if (last.endsWith("ン")) {
    const yon = last.endsWith("ヨン");
    if (rule.h === "b" && !yon) reading = H_TO.b[reading[0]] + reading.slice(1);
    if (rule.h === "p" && (!yon || rule.pAfterYon)) reading = H_TO.p[reading[0]] + reading.slice(1);
    if (rule.afterN && !yon) reading = rule.afterN;
  }
  return { number: head + last, counter: reading };
}

/** Joins words [i, j) into one word with the given reading. */
function merged(ws: Morpheme[], i: number, j: number, reading: string): Morpheme {
  const first = ws[i], last = ws[j - 1];
  return { ...first, surface: ws.slice(i, j).map((w) => w.surface).join(""), reading, dictionaryForm: ws.slice(i, j).map((w) => w.dictionaryForm).join(""),
    normalizedForm: ws.slice(i, j).map((w) => w.normalizedForm).join(""), end: last.end };
}

/** Merge number runs into one word each, with whole-number readings and counter sound changes. */
function fixNumbers(ws: Morpheme[]): Morpheme[] {
  const out: Morpheme[] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const isNan = w.surface === "何" && w.reading === "ナン";
    if (!isNumeralWord(w) && !isNan) { out.push(w); continue; }

    // the run: numerals, plus commas and a decimal point between digits when Sudachi gives them as separate words
    let j = i + 1;
    if (!isNan) {
      while (j < ws.length) {
        if (isNumeralWord(ws[j])) { j++; continue; }
        const between = isDigitText(ws[j - 1].surface) && ws[j + 1] && isDigitText(ws[j + 1].surface);
        if (between && /^[,，.．]$/.test(ws[j].surface)) { j++; continue; }
        break;
      }
    }
    const runText = ws.slice(i, j).map((x) => x.surface).join("");
    const digits = /^[0-9０-９]/.test(runText);
    if (digits && !NUMBER_TEXT.test(runText)) {
      // not a number like 1,000 or 3.14 (e.g. a list 1,2,3): keep the words as Sudachi gave them
      out.push(...ws.slice(i, j)); i = j - 1; continue;
    }
    const [intPart, frac] = digits ? halfWidth(runText).replace(/,/g, "").split(".") : [runText, undefined];
    const decimal = frac === undefined ? -1 : 1;
    // 万年, 億万: a big unit with no number before it isn't いちまん
    const n = isNan || /^[万億兆]/.test(w.surface) ? null : parseNumber(intPart);
    if (!isNan && n == null) { out.push(...ws.slice(i, j)); i = j - 1; continue; }
    let pieces = isNan ? ["ナン"] : numberPieces(n!);
    if (/^0[0-9]+$/.test(intPart)) pieces = [[...intPart].map((d) => DIGIT_SPOKEN[Number(d)]).join("")]; // 007: digit by digit
    if (frac !== undefined) pieces = [...pieces.slice(0, -1), pieces.at(-1) + "テン" + [...frac].map((d) => DIGIT_SPOKEN[Number(d)]).join("")];

    let counter: Morpheme | null = ws[j];
    if (counter?.surface === "分" && ws[j + 1]?.surface === "の") counter = null; // 三分の一: a fraction, さんぶん
    if (n === 0 && decimal < 0 && counter?.tags.includes("助数詞")) pieces = ["レイ"]; // 零時, 0時: れいじ
    const hasRule = counter && decimal < 0 && (counter.tags.includes("助数詞") || counter.pos === "接尾辞") && countReading(n, pieces, counter.surface);
    // one kanji numeral on its own (零, 億, 十): Sudachi's reading fits better than a computed one
    if (j - i === 1 && !digits && !isNan && !hasRule) { out.push(w); continue; }
    const prev = out.at(-1);
    const rule = counter && decimal < 0 && (counter.tags.includes("助数詞") || counter.pos === "接尾辞")
      ? countReading(isNan ? null : n, pieces, counter.surface, { afterMonth: prev?.surface.endsWith("月"), afterDai: (prev?.surface ?? "") === "第" })
      : null;
    if (rule && "whole" in rule) { out.push({ ...merged(ws, i, j + 1, rule.whole), pos: "名詞", tags: ["数詞", "助数詞"] }); i = j; continue; }
    out.push(j - i > 1 || !isNan ? { ...merged(ws, i, j, rule ? rule.number : pieces.join("")), pos: "名詞" } : { ...w, reading: rule ? rule.number : w.reading });
    if (rule) { out.push({ ...counter!, reading: rule.counter }); i = j; } else i = j - 1;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ apply

/** The app's own readings: keys matched against whole words (or runs of words, which become one). */
function applyOwn(ws: Morpheme[], own: Record<string, string>): Morpheme[] {
  const keys = Object.keys(own).sort((a, b) => b.length - a.length);
  if (!keys.length) return ws;
  const out: Morpheme[] = [];
  for (let i = 0; i < ws.length; i++) {
    let hit = null;
    for (const k of keys) {
      if (!k.startsWith(ws[i].surface)) continue;
      let s = "", j = i;
      while (j < ws.length && s.length < k.length) s += ws[j++].surface;
      if (s === k) { hit = { j, reading: toKatakana(own[k]) }; break; }
    }
    if (!hit) { out.push(ws[i]); continue; }
    out.push(hit.j - i === 1 ? { ...ws[i], reading: hit.reading } : merged(ws, i, hit.j, hit.reading));
    i = hit.j - 1;
  }
  return out;
}

/**
 * @param {object[]} words  analyze() results for one text
 * @param {{ everydayReadings?: boolean, readings?: Record<string, string> }} o
 */
export function fixReadings(words: Morpheme[], { everydayReadings = true, readings = {} }: Pick<AnalyzerOptions, "everydayReadings" | "readings"> = {}): Morpheme[] {
  let ws = words;
  if (everydayReadings) {
    ws = fixNumbers(ws);
    ws = ws.map((w, i) => { const r = fixWord(ws, i); return r == null ? w : { ...w, reading: r }; });
  }
  return applyOwn(ws, readings);
}
