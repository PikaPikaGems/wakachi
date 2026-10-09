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
import { segmentWriter } from "kakera/wasm";
import init, { tokenize } from "./sudachi-glue.js";
import { makeAnalyzeText } from "./analyze.js";

// Set by the build (scripts/build.mjs). The page checks it, so a stale copy of the files is reported clearly.
const VERSION = typeof __WAKACHI_VERSION__ === "string" ? __WAKACHI_VERSION__ : "dev";

const analyzeText = makeAnalyzeText(tokenize);
let memory = null;

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
          write.finish();
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
