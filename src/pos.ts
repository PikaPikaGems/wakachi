// Sudachi's part-of-speech tags (UniDic style, six levels) → `pos` (the first level: 名詞, 動詞, 助詞...) and `tags`
// (sub-levels that matter for grouping and readings: 固有名詞, 数詞, 助数詞...). English names: posInEnglish() in text.js.

/** @param {string[]} p  Sudachi's six part-of-speech fields */
import type { Morpheme, PosTag } from "./types.js";

export function sudachiPos(p: string[]): Pick<Morpheme, "pos" | "tags"> {
  const [p0, p1, p2] = p;
  const tags: PosTag[] = [];
  if (p1 === "固有名詞") tags.push("固有名詞");
  if (p1 === "数詞") tags.push("数詞");
  if (p2 === "助数詞可能" || p2 === "助数詞") tags.push("助数詞");
  if (p1 === "非自立可能") tags.push("非自立可能");
  if (p0 === "助詞" && p1 === "接続助詞") tags.push("接続助詞");
  if (p1 === "括弧開") tags.push("括弧開");
  if (p1 === "括弧閉") tags.push("括弧閉");
  return { pos: p0 || "その他", tags };
}
