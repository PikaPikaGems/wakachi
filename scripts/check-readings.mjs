// Compares wakachi's readings with jp-word-ranks-data's (PikaPikaGems/jp-word-ranks-data, a sibling checkout), word
// by word, and writes the mismatches to a TSV. Run after `npm run files` (it uses the cached Sudachi build).
//
//   node scripts/check-readings.mjs [--words N] [--raw] [--list <with_definition.tsv>] [--out <file>]
//
// --words N  only the N most frequent words (default: all)
// --raw      Sudachi's readings without wakachi's fixes (src/readings.js), to see what the fixes change
// Output columns: rank, word, wakachi's reading, the list's readings, how Sudachi cut the word.
// 2026-10-09: all 37,608 kanji words: 2,682 mismatches raw, 2,303 with the fixes (top 10,000: 391 → 261).
import fs from "node:fs";
import { SUDACHI_BUILD } from "./sudachi-build.mjs";
import { makeAnalyzeText } from "../src/analyze.js";
import { fixReadings } from "../src/readings.js";
import { toHiragana } from "../src/text.js";

const root = new URL("../", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const list = opt("list", `${root}../jp-word-ranks-data/OUTPUT/with_definition.tsv`);
const words = Number(opt("words", Infinity));
const out = opt("out", `${root}.cache/readings-mismatches.tsv`);
const raw = args.includes("--raw");

const glue = await import("../src/sudachi-glue.js");
await glue.default({ module_or_path: fs.readFileSync(`${root}.cache/${SUDACHI_BUILD}/sudachi.wasm`) });
const analyze = makeAnalyzeText(glue.tokenize);

// columns: 0 = word, 19 = readings ("a, b")
const rows = fs.readFileSync(list, "utf8").split("\n").slice(1).filter(Boolean).slice(0, words)
  .map((line, i) => { const c = line.split("\t"); return { rank: i + 1, word: c[0], readings: (c[19] ?? "").split(/[,;]\s*/).filter(Boolean) }; })
  .filter((r) => /[一-龯々]/.test(r.word) && r.readings.length);

// one word per line, analyzed in one call (fast); readings fixes never look across a line break
const morphemes = analyze(rows.map((r) => r.word).join("\n"));
const fixed = raw ? morphemes : fixReadings(morphemes);
const perLine = [[]];
for (const m of fixed) {
  if (m.surface.includes("\n")) for (let k = 1; k < m.surface.split("\n").length; k++) perLine.push([]);
  else perLine.at(-1).push(m);
}
const bad = [];
rows.forEach((r, i) => {
  const ms = perLine[i] ?? [];
  const got = toHiragana(ms.map((m) => m.reading).join(""));
  if (!r.readings.includes(got)) bad.push([r.rank, r.word, got, r.readings.join(","), ms.map((m) => m.surface).join("|")].join("\t"));
});
fs.mkdirSync(`${root}.cache`, { recursive: true });
fs.writeFileSync(out, "rank\tword\twakachi\texpected\tcut\n" + bad.join("\n") + "\n");
console.log(`${rows.length} kanji words checked${raw ? " (raw Sudachi)" : ""}: ${bad.length} mismatches -> ${out}`);
