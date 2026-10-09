// Makes the dictionary files that `wakachi copy-files` installs into apps (and that a wakachi release carries):
//
//   node scripts/make-files.mjs [--source <sudachi.wasm>] [--out <dir>]
//
// Input:  Sudachi compiled to WebAssembly with the SudachiDict dictionary inside: the pre-release named in sudachi-build.mjs,
//         made by .github/workflows/build-sudachi.yml (downloaded once into .cache/), or --source.
// Output: <out> (default files/): parts of at most 20 MB + manifest.json (kakera's format) for two files:
//           sudachi.wasm  the program with its data segments removed (see kakera/wasm)
//           dict.bin      the data segments, one after the other; manifest.meta.segments says where each goes
// src/sudachi-glue.js must be the glue of the same build (checked).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { splitFile, writeManifest, contentVersion } from "kakera/split";
import { splitWasm } from "kakera/wasm";
import { SUDACHI_BUILD } from "./sudachi-build.mjs";

const RELEASE = `https://github.com/PikaPikaGems/wakachi/releases/download/${SUDACHI_BUILD}/`;

const root = new URL("../", import.meta.url).pathname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const outDir = path.resolve(opt("out") ?? path.join(root, "files"));
const mb = (n) => (n / 1e6).toFixed(1); // decimal MB, like info().downloadMB
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

async function download(name, dest) {
  if (fs.existsSync(dest)) return fs.readFileSync(dest);
  console.log(`downloading ${RELEASE}${name} ...`);
  const res = await fetch(RELEASE + name);
  if (!res.ok) throw new Error(`${RELEASE}${name}: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(`${dest}.tmp`, bytes);
  fs.renameSync(`${dest}.tmp`, dest);
  return bytes;
}

/** The Sudachi build (program + dictionary in one wasm file) and what it says about itself. */
async function sudachiBuild() {
  if (opt("source")) return { wasm: fs.readFileSync(opt("source")), info: { dictionary: "(--source)" } };
  const cache = path.join(root, ".cache", SUDACHI_BUILD);
  const info = JSON.parse(await download("build-info.json", path.join(cache, "build-info.json")));
  const glue = await download("sudachi-glue.js", path.join(cache, "sudachi-glue.js"));
  if (!glue.equals(fs.readFileSync(path.join(root, "src/sudachi-glue.js")))) {
    throw new Error(`src/sudachi-glue.js is not the glue of ${SUDACHI_BUILD}: copy .cache/${SUDACHI_BUILD}/sudachi-glue.js there`);
  }
  const wasmPath = path.join(cache, "sudachi.wasm");
  if (!fs.existsSync(wasmPath)) {
    fs.writeFileSync(wasmPath, zlib.gunzipSync(await download("sudachi.wasm.gz", path.join(cache, "sudachi.wasm.gz"))));
    fs.rmSync(path.join(cache, "sudachi.wasm.gz"));
  }
  const wasm = fs.readFileSync(wasmPath);
  if (sha256(wasm) !== info.wasmSha256) throw new Error(`${wasmPath} does not match build-info.json (delete .cache/${SUDACHI_BUILD} and run again)`);
  return { wasm, info };
}

const { wasm, info } = await sudachiBuild();
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
  meta: { wakachi: pkg.version, sudachi: opt("source") ? "local build" : SUDACHI_BUILD, dictionary: info.dictionary,
    segments: segments.map((s) => ({ offset: s.offset, length: s.bytes.length })) },
});
console.log(`\n${outDir}/manifest.json: ${info.dictionary}, download ${mb(m.downloadSize)} MB`);
