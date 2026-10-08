// The dictionary files (program + data parts, as the worker loads them) give exactly the same output as the original
// single wasm. Needs `npm run files`.
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { test } from "node:test";
import { sudachi } from "./sudachi.js";

const FILES = new URL("../files/", import.meta.url);

test("split files: same output as the original Sudachi", async () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("manifest.json", FILES)));
  const bytesOf = (f) => Buffer.concat(f.parts.map((p) => {
    const b = fs.readFileSync(new URL(p.file, FILES));
    return f.gzip ? zlib.gunzipSync(b) : b;
  }));
  const [codeFile, dictFile] = manifest.files;
  assert.equal(codeFile.name, "sudachi.wasm");
  assert.equal(dictFile.name, "dict.bin");

  const orig = await sudachi("original");
  const split = await import("../src/sudachi-glue.js?split");
  const { memory } = await split.default(bytesOf(codeFile));
  const data = bytesOf(dictFile);
  let at = 0;
  for (const s of manifest.meta.segments) {
    if (memory.buffer.byteLength < s.offset + s.length) memory.grow(Math.ceil((s.offset + s.length - memory.buffer.byteLength) / 65536));
    new Uint8Array(memory.buffer, s.offset, s.length).set(data.subarray(at, at + s.length));
    at += s.length;
  }
  assert.equal(at, data.length);

  const text = "吾輩は猫である。名前はまだ無い。東京都庁で2026年10月9日に会議があった。スマホでＡＩを使う。";
  assert.equal(split.tokenize(text, 2), orig.glue.tokenize(text, 2));
});
