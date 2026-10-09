// Compiled by `npm run test:types` (never run): the types accept real use and reject mistakes.
import { createAnalyzer, AnalyzerError, VERSION, type Bunsetsu, type Morpheme, type RubySegment, type LoadProgress } from "wakachi";
import { furigana, groupBunsetsu, splitSentences, toHiragana, posLabel, posInEnglish } from "wakachi/text";

const analyzer = createAnalyzer({ filesUrl: "/wakachi/", readings: { "私": "わたくし" }, everydayReadings: true, timeouts: { analyzeStall: 10_000 } });
const off = analyzer.on("progress", (p: LoadProgress) => console.log(p.stage, p.fraction, p.step));
off();
analyzer.on("status", (s) => s === "ready");
analyzer.on("log", (line) => line.toUpperCase());

async function use() {
  const { cached, downloadMB } = await analyzer.info();
  if (!cached) console.log(downloadMB);
  const { fromCache, timings } = await analyzer.load();
  console.log(fromCache, timings?.[0]?.step, VERSION);
  const words: Morpheme[] = await analyzer.analyze("猫が好き。", { signal: new AbortController().signal });
  const ruby: RubySegment[] = await analyzer.furigana("今日は晴れ");
  const phrases: Bunsetsu[] = await analyzer.bunsetsu("猫が好き。");
  phrases[0].morphemes[0].posDetail.join(phrases[0].surface);
  const many: Morpheme[][] = await analyzer.analyzeMany(["一", "二"]);
  furigana(words[0]);
  groupBunsetsu(words).map((g) => g.headDictionaryForm);
  splitSentences("一。二。").map((s) => s.start);
  posLabel(words[0], "ja");
  if (words[0].pos === "動詞" && words[0].tags.includes("非自立可能")) posInEnglish(words[0].pos).toUpperCase();
  toHiragana(ruby[0].text + many.length);
  try { await analyzer.load(); } catch (e) { if (e instanceof AnalyzerError && e.code === "unavailable") analyzer.resetCrashGuard(); }
  analyzer.unload(); analyzer.dispose(); await analyzer.clearCache();
}
use();

// @ts-expect-error  readings are a map of word → reading
createAnalyzer({ readings: ["私"] });
// @ts-expect-error  no such option
createAnalyzer({ engine: "sudachi" });
// @ts-expect-error  analyze takes a string
analyzer.analyze(42);
// @ts-expect-error  no such error code
new AnalyzerError("nope", "x");
// @ts-expect-error  tags are Japanese
const _t: import("wakachi").PosTag = "proper";
