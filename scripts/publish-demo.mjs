// Publishes the demo site (test/analyzer.html with the wakachi files) to this repository's gh-pages branch, served by GitHub
// Pages at https://pikapikagems.github.io/wakachi/.
//
//   node scripts/publish-demo.mjs           build demo/ and publish it
//   node scripts/publish-demo.mjs --build   only build demo/ (then: python3 -m http.server -d demo)
//
// demo/: index.html (the test page, pointing at ./ instead of ../dist/), the page code from dist/, and files/ (what
// `wakachi copy-files` installs, from files/: run `npm run build` and `npm run files` first). Publishing replaces the
// branch's contents with one new commit (a normal push); unchanged parts are stored by git only once.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "demo");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
const page = fs.readFileSync(path.join(ROOT, "test/analyzer.html"), "utf8").replaceAll('"../dist/', '"./');
fs.writeFileSync(path.join(OUT, "index.html"), page);
for (const f of ["wakachi.js", "text.js"]) fs.copyFileSync(path.join(ROOT, "dist", f), path.join(OUT, f));
execFileSync(process.execPath, [path.join(ROOT, "bin/wakachi.mjs"), "copy-files", path.join(OUT, "files"), "--from", path.join(ROOT, "files")], { stdio: "inherit" });
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`built ${path.relative(process.cwd(), OUT) || "demo"}/`);
if (process.argv.includes("--build")) process.exit(0);

const origin = git(ROOT, "remote", "get-url", "origin");
const sha = git(ROOT, "rev-parse", "--short", "HEAD");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gh-pages-"));
try {
  try { git(os.tmpdir(), "clone", "--quiet", "--branch", "gh-pages", "--single-branch", "--depth", "1", origin, tmp); }
  catch { git(tmp, "init", "--quiet", "-b", "gh-pages"); git(tmp, "remote", "add", "origin", origin); } // first publish
  for (const e of fs.readdirSync(tmp)) if (e !== ".git") fs.rmSync(path.join(tmp, e), { recursive: true, force: true });
  fs.cpSync(OUT, tmp, { recursive: true });
  git(tmp, "add", "-A");
  if (!git(tmp, "status", "--porcelain")) { console.log("Nothing to publish: gh-pages is already up to date."); process.exit(0); }
  git(tmp, "commit", "--quiet", "-m", `Demo built from ${sha}`);
  git(tmp, "-c", "http.postBuffer=524288000", "push", "--quiet", "origin", "gh-pages");
  console.log("Pushed to gh-pages. Turn on Pages once (Settings → Pages → gh-pages, / root); it updates within a minute or two.");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
