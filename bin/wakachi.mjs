#!/usr/bin/env node
// wakachi command line.
//
//   wakachi copy-files <folder> [--from <url or folder>]
//
// Puts the dictionary files (parts of at most 20 MB + manifest.json) and the engine worker into <folder>, e.g.
// public/wakachi, which the page loads from at /wakachi/. Meant for "predev" / "prebuild": when <folder> is already up
// to date it only checks sizes and returns.
//
// The files come from this version's GitHub release (or --from), are checked against the manifest's SHA-256 and kept
// in a cache on this computer (~/.cache/wakachi), so they download once per version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const pkgDir = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", pkgDir)));
const RELEASE = `https://github.com/PikaPikaGems/wakachi/releases/download/v${pkg.version}/`;
const WORKER = "wakachi-worker.js";
const LICENSES = "THIRD-PARTY-LICENSES.md"; // goes wherever the worker goes
const USAGE = "usage: wakachi copy-files <folder> [--from <url or folder>]";

const die = (msg) => { console.error(`wakachi: ${msg}`); process.exit(1); };
const mb = (n) => (n / 1e6).toFixed(0); // same MB as info().downloadMB
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isUrl = (s) => /^https?:\/\//.test(s);

const [cmd, ...args] = process.argv.slice(2);
if (cmd !== "copy-files") die(USAGE);
let dest = null, from = RELEASE;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--from") from = args[++i];
  else if (!dest && !args[i].startsWith("--")) dest = args[i];
  else die(USAGE);
}
if (!dest || !from) die(USAGE);
dest = path.resolve(dest);
if (!isUrl(from)) from = path.resolve(from);

const source = {
  async read(name) {
    if (!isUrl(from)) return fs.readFileSync(path.join(from, name));
    const url = new URL(name, from.endsWith("/") ? from : `${from}/`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  },
};

async function main() {
  const manifest = JSON.parse(await source.read("manifest.json").catch((e) => die(`could not read the dictionary files' manifest.json from ${from}\n  (${e.message})`)));
  if (manifest.format !== "kakera/1") die(`${from}: unexpected manifest format ${manifest.format}`);
  const parts = manifest.files.flatMap((f) => f.parts);
  const worker = fs.readFileSync(new URL(`dist/${WORKER}`, pkgDir));

  // Already up to date? (same manifest, parts of the right size, same worker)
  const oldManifestPath = path.join(dest, "manifest.json");
  const old = fs.existsSync(oldManifestPath) ? JSON.parse(fs.readFileSync(oldManifestPath, "utf8")) : null;
  const sameFiles = old?.version === manifest.version
    && parts.every((p) => fs.statSync(path.join(dest, p.file), { throwIfNoEntry: false })?.size === p.size);
  const workerPath = path.join(dest, WORKER);
  const licenses = fs.readFileSync(new URL(`dist/${LICENSES}`, pkgDir));
  const sameFile = (p, bytes) => fs.existsSync(p) && fs.readFileSync(p).equals(bytes);
  const sameWorker = sameFile(workerPath, worker) && sameFile(path.join(dest, LICENSES), licenses);
  if (sameFiles && sameWorker) { console.log(`wakachi: ${path.relative(process.cwd(), dest) || "."} is up to date`); return; }

  fs.mkdirSync(dest, { recursive: true });
  if (!sameFiles) {
    const cache = path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "wakachi", manifest.version);
    fs.mkdirSync(cache, { recursive: true });
    let fetched = 0;
    for (const p of parts) {
      const cached = path.join(cache, p.file);
      if (fs.existsSync(cached) && fs.statSync(cached).size === p.size) continue;
      const bytes = await source.read(p.file);
      if (sha256(bytes) !== p.sha256) die(`${p.file} from ${from} is corrupt (checksum mismatch); run the command again`);
      fs.writeFileSync(`${cached}.tmp`, bytes);
      fs.renameSync(`${cached}.tmp`, cached);
      fetched += bytes.length;
      if (isUrl(from)) process.stdout.write(`\rwakachi: downloaded ${mb(fetched)} of ${mb(manifest.downloadSize)} MB `);
    }
    if (fetched && isUrl(from)) process.stdout.write("\n");
    // remove the parts of an older version (only files that its manifest listed)
    const keep = new Set(parts.map((p) => p.file));
    for (const f of old?.files ?? []) for (const p of f.parts ?? []) if (!keep.has(p.file)) fs.rmSync(path.join(dest, p.file), { force: true });
    for (const p of parts) fs.copyFileSync(path.join(cache, p.file), path.join(dest, p.file));
    fs.writeFileSync(oldManifestPath, JSON.stringify(manifest, null, 2)); // last: marks the folder complete
  }
  if (!sameWorker) fs.writeFileSync(workerPath, worker);
  fs.writeFileSync(path.join(dest, LICENSES), licenses);
  const where = path.relative(process.cwd(), dest) || ".";
  console.log(sameFiles ? `wakachi: updated ${WORKER} in ${where}` : `wakachi: copied the dictionary files (${mb(manifest.downloadSize)} MB) to ${where}`);
}

main().catch((e) => die(e.message));
