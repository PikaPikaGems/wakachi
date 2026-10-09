import assert from "node:assert/strict";
import { test } from "node:test";
import { furigana, furiganaOf, groupBunsetsu, POS_ENGLISH, posInEnglish, posLabel, splitSentences, toHiragana } from "../src/text.js";

const w = (surface, reading, pos = "名詞", extra = {}) => ({ surface, reading, pos, tags: [], posDetail: ["名詞", "普通名詞", "一般", "*", "*", "*"], dictionaryForm: surface, ...extra });

test("furigana: okurigana left alone, whole-word fallback, kana-only words", () => {
  assert.deepEqual(furigana(w("食べ", "タベ")), [{ text: "食", reading: "た" }, { text: "べ" }]);
  assert.deepEqual(furigana(w("お母さん", "オカアサン")), [{ text: "お" }, { text: "母", reading: "かあ" }, { text: "さん" }]);
  assert.deepEqual(furigana(w("今日", "キョウ")), [{ text: "今日", reading: "きょう" }]);
  assert.deepEqual(furigana(w("ねこ", "ネコ")), [{ text: "ねこ" }]);
  assert.deepEqual(furigana(w("或いは", "アルイワ")), [{ text: "或いは", reading: "あるいわ" }]); // can't line up
  assert.deepEqual(furigana(w("1つ", "ヒトツ")), [{ text: "1", reading: "ひと" }, { text: "つ" }]);
});

test("furiganaOf: plain pieces merged, text joins back", () => {
  const out = furiganaOf([w("今日", "キョウ"), w("は", "ハ"), w("晴れ", "ハレ")]);
  assert.deepEqual(out, [{ text: "今日", reading: "きょう" }, { text: "は" }, { text: "晴", reading: "は" }, { text: "れ" }]);
});

test("splitSentences: quotes stay together, positions point into the text", () => {
  const text = "「行こう！」と彼は言った。\n  次の文。3.14 は数。End. ";
  const s = splitSentences(text);
  assert.deepEqual(s.map((x) => x.text), ["「行こう！」と彼は言った。", "次の文。", "3.14 は数。", "End."]);
  for (const x of s) assert.equal(text.slice(x.start, x.end), x.text);
});

test("groupBunsetsu: content word plus what follows", () => {
  const words = [
    { ...w("猫", "ネコ"), start: 0, end: 1 },
    { ...w("が", "ガ", "助詞"), start: 1, end: 2 },
    { ...w("食べ", "タベ", "動詞", { dictionaryForm: "食べる" }), start: 2, end: 4 },
    { ...w("て", "テ", "助詞", { tags: ["接続助詞"] }), start: 4, end: 5 },
    { ...w("いる", "イル", "動詞", { tags: ["非自立可能"] }), start: 5, end: 7 },
  ];
  const g = groupBunsetsu(words);
  assert.deepEqual(g.map((x) => x.morphemes.map((m) => m.surface).join("")), ["猫が", "食べている"]);
  assert.equal(g[1].headDictionaryForm, "食べる");
  assert.equal(g[1].surface, "食べている");
  assert.deepEqual([g[1].start, g[1].end], [2, 7]);
});

test("toHiragana, posLabel, posInEnglish", () => {
  assert.equal(toHiragana("ネコとイヌ"), "ねこといぬ");
  assert.equal(posLabel({ posDetail: ["動詞", "一般", "*", "*", "*", "*"] }), "動詞・一般");
  assert.equal(posLabel({ posDetail: ["動詞", "一般", "*", "*", "*", "*"] }, "en"), "verb, general");
  assert.equal(posInEnglish("名詞"), "noun");
  assert.equal(posInEnglish("固有名詞"), "proper noun");
  assert.equal(posInEnglish("知らない"), "知らない");
});

test("POS_ENGLISH covers every tag SudachiDict uses in posDetail levels 1-4", () => {
  // read from the dictionary's part-of-speech table (1,558 combinations), SudachiDict small 20260723
  const used = [
    "代名詞", "副詞", "助動詞", "助詞", "動詞", "名詞", "形容詞", "形状詞", "感動詞", "接尾辞", "接続詞", "接頭辞", "空白", "補助記号", "記号", "連体詞",
    "タリ", "フィラー", "一般", "係助詞", "副助詞", "助動詞語幹", "動詞的", "句点", "名詞的", "固有名詞", "形容詞的", "形状詞的", "括弧閉", "括弧開",
    "接続助詞", "数詞", "文字", "普通名詞", "格助詞", "準体助詞", "終助詞", "読点", "非自立可能", "ＡＡ",
    "サ変可能", "サ変形状詞可能", "人名", "副詞可能", "助数詞", "助数詞可能", "地名", "形状詞可能", "顔文字",
    "名", "国", "姓",
  ];
  assert.deepEqual(used.filter((t) => !(t in POS_ENGLISH)), []);
  assert.deepEqual(Object.keys(POS_ENGLISH).filter((t) => !used.includes(t) && t !== "その他"), []);
});
