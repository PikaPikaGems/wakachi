// Node tests for the analysis logic that runs inside the worker. Needs .cache/sudachi-0.1.5.wasm (npm run files).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { splitInput, MAX_PIECE } from "../src/split-input.js";
import { makeAnalyzeText } from "../src/analyze.js";
import { sudachi } from "./sudachi.js";

const { glue, memory } = await sudachi("analyze");
const analyzeText = makeAnalyzeText(glue.tokenize);

/** Every morpheme lines up with the input, and together they cover all of it. */
function assertCovers(text, morphs) {
  assert.equal(morphs.map((m) => m.surface).join(""), text);
  let pos = 0;
  for (const m of morphs) {
    assert.equal(m.start, pos);
    assert.equal(text.slice(m.start, m.end), m.surface);
    pos = m.end;
  }
}

test("splitInput: pieces join back, never split a surrogate pair, cut after sentence ends", () => {
  for (const text of ["猫が好き。", "吾輩は猫である。「名前は？」\n".repeat(2000), "あ".repeat(20000), "𠮷".repeat(9000)]) {
    const pieces = splitInput(text);
    assert.equal(pieces.map((p) => p.text).join(""), text);
    for (const p of pieces) {
      assert.ok(p.text.length <= MAX_PIECE);
      assert.ok(!/^[\udc00-\udfff]/.test(p.text) && !/[\ud800-\udbff]$/.test(p.text));
      assert.equal(text.slice(p.offset, p.offset + p.text.length), p.text);
    }
  }
  const novel = splitInput("吾輩は猫である。「名前は？」\n".repeat(2000));
  assert.ok(novel.length > 1);
  for (const p of novel.slice(0, -1)) assert.match(p.text, /[。？」\n]$/);
});

test("analyze: fields, engine-neutral pos/tags, offsets", () => {
  const text = "東京で5分「走った」。";
  const m = analyzeText(text);
  assertCovers(text, m);
  const by = Object.fromEntries(m.map((x) => [x.surface, x]));
  assert.equal(by["東京"].pos, "名詞");
  assert.ok(by["東京"].tags.includes("固有名詞"));
  assert.equal(by["「"].pos, "補助記号");
  assert.ok(by["「"].tags.includes("括弧開"));
  assert.equal(by["走っ"].pos, "動詞");
  assert.equal(by["走っ"].dictionaryForm, "走る");
  assert.equal(by["走っ"].reading, "ハシッ");
  assert.equal(by["た"].pos, "助動詞");
});

test("analyze: whitespace and line breaks come back as whitespace morphemes", () => {
  const text = " 猫 が\n\n好き　";
  const m = analyzeText(text);
  assertCovers(text, m);
  assert.ok(m.filter((x) => /^\s+$/.test(x.surface) && x.surface !== "　").every((x) => x.pos === "空白"));
});

test("analyze: long URLs, emoji runs and latin runs don't crash Sudachi", () => {
  const before = analyzeText.traps();
  for (const text of [
    "見て https://example.com/" + "abcdefghij".repeat(30) + " すごい",
    "最高" + "😀".repeat(200) + "！",
    "w".repeat(1000), "ｗ".repeat(300), "𠮷".repeat(500),
  ]) assertCovers(text, analyzeText(text));
  assert.equal(analyzeText.traps(), before, "no Sudachi crash");
});

test("analyze: surfaces are the original characters even where Sudachi rewrites them", () => {
  for (const text of ["見て https://example.com/a?b=c&d=e", "時刻は12:30です", "㍿と①と㌔とＡＢＣとabcとｶﾀｶﾅ", "ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟとｶﾞｷﾞ"]) {
    assertCovers(text, analyzeText(text));
  }
});

test("analyze: the safety net splits a piece that still traps", () => {
  const fake = (text) => {
    if (Array.from(text).length > 10) throw new WebAssembly.RuntimeError("unreachable");
    return JSON.stringify(Array.from(text, (c) => ({ surface: c, poses: ["名詞", "普通名詞", "一般", "*", "*", "*"], dictionary_form: "", reading_form: c, normalized_form: c })));
  };
  const analyze = makeAnalyzeText(fake);
  const text = "あいうえおかきくけこさしすせそたちつてと".repeat(3);
  assertCovers(text, analyze(text));
  assert.ok(analyze.traps() > 0);
});

test("analyze: long text keeps memory flat and matches one call", () => {
  const text = "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。\n".repeat(1500); // ~52,000 chars
  const m = analyzeText(text);
  assertCovers(text, m);
  assert.ok(memory.buffer.byteLength < 160 * 1048576, `memory grew to ${(memory.buffer.byteLength / 1048576).toFixed(0)} MB`);
  const short = text.slice(0, 5000);
  assert.deepEqual(analyzeText(short).map((x) => x.surface), JSON.parse(glue.tokenize(short, 2)).map((x) => x.surface));
});

test("many texts share Sudachi calls, and each comes back whole", () => {
  let calls = 0;
  const counted = makeAnalyzeText((t, mode) => { calls++; return glue.tokenize(t, mode); });
  const texts = ["猫が好き。", "猫 ", " 犬\n", "", "\n\n", "  ", "見て https://example.com/" + "abcdefghij".repeat(30), "今日は晴れ。", ...Array(100).fill("短い文。")];
  const results = counted.many(texts);
  assert.equal(results.length, texts.length);
  results.forEach((words, i) => assertCovers(texts[i], words));
  assert.ok(calls <= 2, `${calls} Sudachi calls for ${texts.length} texts`);
  // same words as analyzing each text alone
  for (const i of [0, 6, 7]) assert.deepEqual(results[i].map((w) => w.surface), analyzeText(texts[i]).map((w) => w.surface));
});
