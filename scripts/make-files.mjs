// Makes the dictionary files that `wakachi copy-files` installs into apps (and that a GitHub release will carry):
//
//   node scripts/make-files.mjs [--source <sudachi.wasm>] [--out <dir>]
//
// Input:  Sudachi compiled to wasm with SudachiDict "core" inside (the npm package sudachi@0.1.5, downloaded once
//         into .cache/, or --source: the same binary already extracted).
// Output: <out> (default files/): parts of at most 20 MB + manifest.json (kakera's format) for two files:
//           sudachi.wasm  the program with its data segments removed (see split-wasm.mjs)
//           dict.bin      the data segments, one after the other; manifest.meta.segments says where each goes
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitFile, writeManifest, contentVersion } from "kakera/split";
import { splitWasm } from "./split-wasm.mjs";

const SUDACHI_NPM = "sudachi@0.1.5";
const SUDACHI_SHA256 = "c1485e172eb74e07c487ef8e0ed43044ec7424281cca3784dd2e81182f45dc8e"; // the binary inside it
const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const outDir = path.resolve(opt("out") ?? path.join(root, "files"));
const mb = (n) => (n / 1048576).toFixed(1);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

/** The Sudachi binary (program + dictionary in one wasm file). */
function sudachiWasm() {
  if (opt("source")) return fs.readFileSync(opt("source"));
  const cached = path.join(root, ".cache", "sudachi-0.1.5.wasm");
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  // the npm file sudachi.js is wasm-bindgen glue followed by the whole binary as one base64 string
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wakachi-"));
  try {
    console.log(`downloading ${SUDACHI_NPM} (164 MB, once) ...`);
    execFileSync("npm", ["pack", SUDACHI_NPM, "--pack-destination", tmp, "--silent"], { stdio: "inherit" });
    execFileSync("tar", ["-xzf", path.join(tmp, "sudachi-0.1.5.tgz"), "-C", tmp]);
    const js = fs.readFileSync(path.join(tmp, "package/sudachi.js"));
    const marker = Buffer.from("const wasmBASE64 = '");
    const start = js.indexOf(marker) + marker.length;
    const end = js.indexOf(Buffer.from("';"), start);
    if (start < marker.length || end < 0) throw new Error("could not find the wasm inside sudachi.js (did the package change?)");
    const wasm = Buffer.from(js.subarray(start, end).toString("latin1"), "base64");
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, wasm);
    return wasm;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const wasm = sudachiWasm();
if (sha256(wasm) !== SUDACHI_SHA256) throw new Error(`the Sudachi binary is not the one wakachi was tested with (sha256 ${sha256(wasm)})`);
const { code, segments } = splitWasm(wasm);
const data = Buffer.concat(segments.map((s) => s.bytes));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const files = [];
for (const [name, bytes] of [["sudachi.wasm", code], ["dict.bin", data]]) {
  const f = splitFile(bytes, { name, outDir });
  files.push(f);
  console.log(`${name.padEnd(14)} ${mb(f.size).padStart(6)} MB -> ${f.parts.length} part(s), ${mb(f.parts.reduce((n, p) => n + p.size, 0))} MB on the server${f.gzip ? " (gzip)" : ""}`);
}
const m = writeManifest(outDir, {
  name: "wakachi-sudachi",
  version: contentVersion(code, data),
  files,
  meta: { wakachi: pkg.version, sudachi: SUDACHI_NPM, segments: segments.map((s) => ({ offset: s.offset, length: s.bytes.length })) },
});
console.log(`\n${outDir}/manifest.json: download ${mb(m.downloadSize)} MB`);
