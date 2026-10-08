import assert from "node:assert/strict";
import { test } from "node:test";
import { furigana, furiganaOf, groupBunsetsu, posLabel, splitSentences, toHiragana } from "../src/text.js";

const w = (surface, reading, pos = "noun", extra = {}) => ({ surface, reading, pos, tags: [], posDetail: ["名詞", "普通名詞", "一般", "*", "*", "*"], dictionaryForm: surface, ...extra });

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
    { ...w("が", "ガ", "particle"), start: 1, end: 2 },
    { ...w("食べ", "タベ", "verb", { dictionaryForm: "食べる" }), start: 2, end: 4 },
    { ...w("て", "テ", "particle", { tags: ["conjunctive"] }), start: 4, end: 5 },
    { ...w("いる", "イル", "verb", { tags: ["dependent"] }), start: 5, end: 7 },
  ];
  const g = groupBunsetsu(words);
  assert.deepEqual(g.map((x) => x.morphemes.map((m) => m.surface).join("")), ["猫が", "食べている"]);
  assert.equal(g[1].headDictionaryForm, "食べる");
  assert.deepEqual([g[1].start, g[1].end], [2, 7]);
});

test("toHiragana and posLabel", () => {
  assert.equal(toHiragana("ネコとイヌ"), "ねこといぬ");
  assert.equal(posLabel({ posDetail: ["動詞", "一般", "*", "*", "*", "*"] }), "Verb, general");
  assert.equal(posLabel({ posDetail: ["動詞", "一般", "*", "*", "*", "*"] }, "ja"), "動詞・一般");
});
