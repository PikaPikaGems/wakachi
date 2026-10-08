// Builds what apps get:
//   dist/wakachi.js         the page side (kakera bundled in; no dependencies left for apps to install)
//   dist/text.js            wakachi/text: pure helpers, no worker
//   dist/wakachi-worker.js  Sudachi's worker, in one file. `wakachi copy-files` puts it next to the dictionary files,
//                           and the page starts it from there
//   dist/THIRD-PARTY-LICENSES.md  licences of what the worker and the dictionary files contain; copied with them
import fs from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root)));
const define = { __WAKACHI_VERSION__: JSON.stringify(pkg.version) };
const banner = { js: `/*! wakachi ${pkg.version} worker (MIT). Runs Sudachi (Apache-2.0); see THIRD-PARTY-LICENSES.md next to this file. */` };
const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", define, logLevel: "warning", absWorkingDir: root.pathname };

await build({ ...common, entryPoints: ["src/index.js"], outfile: "dist/wakachi.js" });
await build({ ...common, entryPoints: ["src/text.js"], outfile: "dist/text.js" });
await build({ ...common, entryPoints: ["src/worker.js"], outfile: "dist/wakachi-worker.js", minify: true, legalComments: "eof", banner });

fs.writeFileSync(new URL("dist/THIRD-PARTY-LICENSES.md", root), [
  `# Third-party licences\n\nwakachi-worker.js (wakachi ${pkg.version}, MIT) and the dictionary files next to it contain the software below.\n`,
  "## Sudachi and SudachiDict\n",
  "[sudachi.rs](https://github.com/WorksApplications/sudachi.rs) with the SudachiDict \"core\" dictionary, compiled to",
  "WebAssembly by [hata6502/sudachi-wasm](https://github.com/hata6502/sudachi-wasm) (npm `sudachi@0.1.5`).",
  "Copyright Works Applications Co., Ltd. Licensed under the Apache License, Version 2.0 (below).",
  "SudachiDict incorporates UniDic (BSD-3-Clause) and NEologd data: see",
  "https://github.com/WorksApplications/SudachiDict#license and https://github.com/hata6502/sudachi-wasm#disclaimer.\n",
  "The dictionary files are the data of that build, split into parts; wakachi does not modify them.\n",
  "```",
  fs.readFileSync(new URL("licenses/Apache-2.0.txt", root), "utf8").trim(),
  "```",
  "",
].join("\n"));

for (const f of ["wakachi.js", "text.js", "wakachi-worker.js", "THIRD-PARTY-LICENSES.md"]) {
  console.log(`dist/${f}  ${(fs.statSync(new URL(`dist/${f}`, root)).size / 1024).toFixed(0)} KB`);
}
