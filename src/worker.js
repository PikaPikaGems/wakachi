// The engine, inside a Web Worker: Sudachi (wasm). Built into a single file, dist/wakachi-worker.js, which
// `wakachi copy-files` puts next to the dictionary files; the page starts it from there (see index.js), so apps'
// bundlers never have to handle it.
//
// Files (from the manifest, in this order):
//   sudachi.wasm   the program, with its dictionary taken out (1 MB). Instantiating it reserves Sudachi's memory
//                  (~120 MB) BEFORE the dictionary is downloaded, so a browser that refuses the memory fails at once
//                  with "out-of-memory" instead of after a 43 MB download.
//   dict.bin       the dictionary: the program's data segments, one after the other. Streamed part by part straight
//                  into Sudachi's memory at the offsets in manifest.meta.segments, so the browser holds it once
//                  (in wasm memory) instead of twice (wasm memory + the compiled module's copy).
import { serveEngine } from "kakera/worker";
import { collect } from "kakera/files";
import { codedError } from "kakera/errors";
import init, { tokenize } from "./sudachi-glue.js";
import { makeAnalyzeText } from "./analyze.js";

// Set by the build (scripts/build.mjs). The page checks it, so a stale copy of the files is reported clearly.
const VERSION = typeof __WAKACHI_VERSION__ === "string" ? __WAKACHI_VERSION__ : "dev";

const analyzeText = makeAnalyzeText(tokenize);
let memory = null;

/** Writes a stream of bytes across the data segments, in order. */
function segmentWriter(mem, segments) {
  const end = Math.max(...segments.map((s) => s.offset + s.length));
  if (mem.buffer.byteLength < end) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536));
  let seg = 0, pos = 0;
  return (chunk) => {
    let c = 0;
    while (c < chunk.length) {
      const s = segments[seg];
      if (!s) throw codedError("checksum-mismatch", "the dictionary is longer than its segment table");
      const n = Math.min(s.length - pos, chunk.length - c);
      new Uint8Array(mem.buffer, s.offset + pos, n).set(chunk.subarray(c, c + n));
      pos += n; c += n;
      if (pos === s.length) { seg++; pos = 0; }
    }
  };
}

async function load(_msg, ctx) {
  let write = null;
  await ctx.loadFiles({
    onFile: async (file, chunks, manifest) => {
      switch (file.name) {
        case "sudachi.wasm": {
          const bytes = await collect(chunks, file.size);
          ctx.step("start-sudachi", { file: file.name });
          memory = (await init({ module_or_path: bytes })).memory;
          write = segmentWriter(memory, manifest.meta.segments);
          break;
        }
        case "dict.bin":
          if (!write) throw codedError("engine-failed", "dict.bin came before sudachi.wasm in the manifest");
          for await (const chunk of chunks) write(chunk);
          break;
        default:
          ctx.log(`ignoring unknown file ${file.name}`);
      }
    },
  });
  if (!write) throw codedError("engine-failed", "the dictionary files are incomplete (run wakachi copy-files again)");
  ctx.step("warm-up");
  analyzeText("今日は良い天気ですね。"); // Sudachi builds its dictionary structures on the first call (once)
  return { version: VERSION, memoryBytes: memory.buffer.byteLength };
}

serveEngine({
  load,
  calls: {
    version: async () => VERSION,
    analyze: async ({ texts }, ctx) => analyzeText.many(texts, ctx.alive),
  },
});
