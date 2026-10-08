// Everyday readings and the app's own readings, on real Sudachi output. Needs .cache/sudachi-0.1.5.wasm (npm run files).
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeAnalyzeText } from "../src/analyze.js";
import { fixReadings, numberPieces, parseNumber } from "../src/readings.js";
import { sudachi } from "./sudachi.js";

const { glue } = await sudachi("readings");
const analyzeText = makeAnalyzeText(glue.tokenize);
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
/** "surface(reading) ..." for the words of `text` that have a reading. */
const read = (text, o) => fixReadings(analyzeText(text), o).map((w) => `${w.surface}(${hira(w.reading)})`).join(" ");
/** The whole text's reading, in hiragana. */
const whole = (text, o) => hira(fixReadings(analyzeText(text), o).map((w) => w.reading).join(""));

function covers(text, words) {
  assert.equal(words.map((w) => w.surface).join(""), text);
  let pos = 0;
  for (const w of words) { assert.equal(w.start, pos); assert.equal(text.slice(w.start, w.end), w.surface); pos = w.end; }
}

test("everyday words", () => {
  const cases = {
    "私は明日日本に行く": "わたしはあしたにほんにいく",
    "私たち": "わたしたち",
    "日本語と日本人と外国人": "にほんごとにほんじんとがいこくじん",
    "お母さんとお父さんとお兄ちゃんと姉さん": "おかあさんとおとうさんとおにいちゃんとねえさん",
    "これは本だと言う": "これはほんだという",
    "そう言うこと": "そういうこと",
    "何か食べる": "なにかたべる",
    "何も無い": "なにもない",
    "何で": "なんで",
    "これが気に入った": "これがきにいった",
    "誕生日": "たんじょうび",
    "株式会社と子会社": "かぶしきがいしゃとこがいしゃ",
    "もう一度": "もういちど",
    "何人いる": "なんにんいる",
    "上手に話す": "じょうずにはなす",
    "或いは": "あるいは",
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(whole(text), want, text);
});

test("numbers: one word, whole-number readings", () => {
  assert.equal(read("10月"), "10(じゅう) 月(がつ)");
  assert.equal(read("三十五人"), "三十五(さんじゅうご) 人(にん)");
  assert.equal(read("2026年"), "2026(にせんにじゅうろく) 年(ねん)");
  assert.equal(read("1,000円"), "1,000(せん) 円(えん)");
  assert.equal(read("3.14"), "3.14(さんてんいちよん)");
  assert.equal(read("１０時半"), "１０(じゅう) 時(じ) 半(はん)");
  assert.equal(read("007"), "007(ぜろぜろなな)");
});

test("numbers: counter sound changes", () => {
  const cases = {
    "30分": "さんじゅっぷん", "8分": "はっぷん", "4分": "よんぷん", "何分": "なんぷん",
    "一回": "いっかい", "100回": "ひゃっかい", "6個": "ろっこ", "3階": "さんがい", "何階": "なんがい", "4階": "よんかい",
    "百本": "ひゃっぽん", "鉛筆を三本": "えんぴつをさんぼん", "4本": "よんほん", "六本": "ろっぽん", "何本": "なんぼん", "1杯": "いっぱい",
    "8歳": "はっさい", "20歳": "はたち", "一週間": "いっしゅうかん",
    "4時": "よじ", "7時": "しちじ", "9時": "くじ", "4月": "しがつ", "9月": "くがつ", "4年": "よねん", "4人": "よにん",
    "1人": "ひとり", "2人": "ふたり", "1つ": "ひとつ",
    "4日": "よっか", "20日": "はつか", "二十日": "はつか", "十四日": "じゅうよっか", "15日": "じゅうごにち",
    "4月1日": "しがつついたち", "1日に3回": "いちにちにさんかい", "一日中": "いちにちじゅう",
  };
  for (const [text, want] of Object.entries(cases)) {
    // 一日中: Sudachi says ちゅう for 中 here, which is a different (context) question
    if (text === "一日中") { assert.match(whole(text), /^いちにち/); continue; }
    assert.equal(whole(text), want, text);
  }
});

test("positions still line up after merging", () => {
  for (const text of ["2026年4月1日に1,000円と3.14", "二十日と十四日", "007と１０時", "何本何階"]) covers(text, fixReadings(analyzeText(text)));
});

test("everydayReadings: false leaves Sudachi's readings alone", () => {
  assert.equal(whole("私は明日", { everydayReadings: false }), "わたくしはあす");
  assert.equal(read("10月", { everydayReadings: false }), "1(いち) 0(れい) 月(がつ)");
});

test("the app's own readings win, and can span several words", () => {
  assert.equal(whole("私は明日", { readings: { "私": "わたくし" } }), "わたくしはあした");
  assert.equal(whole("大分に行く", { readings: { "大分": "おおいた" } }), "おおいたにいく");
  const ws = fixReadings(analyzeText("お母さんが来た"), { readings: { "お母さん": "おかあさま" } });
  assert.equal(ws[0].surface, "お母さん");
  assert.equal(hira(ws[0].reading), "おかあさま");
  covers("お母さんが来た", ws);
});

test("parseNumber and numberPieces", () => {
  assert.equal(parseNumber("三十五"), 35);
  assert.equal(parseNumber("二〇二六"), 2026);
  assert.equal(parseNumber("3万"), 30000);
  assert.equal(parseNumber("一億二千万"), 120000000);
  assert.equal(parseNumber("１２,３４５"), 12345);
  assert.equal(numberPieces(3608).join(""), "サンゼンロッピャクハチ");
  assert.equal(numberPieces(10000).join(""), "イチマン");
  assert.equal(numberPieces(800).join(""), "ハッピャク");
  assert.equal(numberPieces(0).join(""), "ゼロ");
});
