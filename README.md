# wakachi

> [!WARNING]
> This project is experimental. Use it at your own risk.

Japanese furigana and word analysis in the browser, with everyday readings. Runs
[Sudachi](https://github.com/WorksApplications/sudachi.rs) on the device (no server) and works on iPhone Safari.
*wakachi* comes from 分かち書き (*wakachi-gaki*): writing Japanese with spaces between the words.

**Work in progress:** it works (tested in Chrome on a Mac); iPhone testing and the first release are next.
The API is in [API.md](API.md).

```js
import { createAnalyzer } from "wakachi";

const analyzer = createAnalyzer();
await analyzer.load();                                  // 44 MB the first time, then from the device
await analyzer.furigana("私は明日10月4日に行く");
// → 私(わたし)は明日(あした)10(じゅう)月(がつ)4日(よっか)に行(い)く
await analyzer.analyze("猫が好き。");                     // words with readings, dictionary forms, parts of speech
```

## What it adds to Sudachi

- **Everyday readings:** 私 わたし (not わたくし), 明日 あした, 日本 にほん, お母さん, 言う いう, and numbers read as numbers
  with their sound changes (10月 じゅうがつ, 一回 いっかい, 3本 さんぼん, 4日 よっか): [API.md § Readings](API.md#6-readings).
- **Plug and play:** one command (`wakachi copy-files`) puts the dictionary, in parts of at most 20 MB, and the worker
  in your `public/` folder. No bundler setup, no dependencies to install.
- **Phone protections:** loads only when you call `load()`, frees memory when idle or in the background, never
  crashes the same phone twice, times out instead of hanging, and keeps memory flat on long text.
- **Speed:** many texts share one Sudachi call (this build costs ~100 ms per call), so `analyzeMany` of 100 lines
  takes about as long as one.

## How it fits together

```
page:   dist/wakachi.js        createAnalyzer(): reading fixes, furigana
          │  (kakera: one worker per page, crash guard, timeouts, idle/hidden unloading)
worker: wakachi-worker.js      Sudachi (wasm), safe input splitting, batching
          │  (kakera: parts downloaded once, checked, kept in IndexedDB)
files:  manifest.json + parts  Sudachi's program (1 MB) and dictionary (116 MB, 44 MB to download)
```

[kakera](https://github.com/PikaPikaGems/kakera) is the plumbing shared with
[yomiage](https://github.com/PikaPikaGems/yomiage) (Japanese text-to-speech); it is bundled in at build time.

## Layout

```
src/index.js        createAnalyzer, AnalyzerError (page side)
src/worker.js       Sudachi in the worker: streams the dictionary straight into its memory
src/analyze.js      Sudachi's output to words: positions, URL/emoji protection, batching
src/readings.js     everyday readings and numbers; the app's own readings
src/text.js         wakachi/text: furigana, bunsetsu, sentences, labels
src/split-input.js  cutting long text at sentence ends
src/pos.js          Sudachi's part-of-speech tags to pos/tags
src/sudachi-glue.js wasm-bindgen glue from the npm Sudachi build
bin/wakachi.mjs     wakachi copy-files
scripts/            build.mjs (dist/), make-files.mjs (files/), split-wasm.mjs
types/              index.d.ts, text.d.ts
test/               Node tests; analyzer.html: try it + automatic checks in the browser
```

## Development

```bash
npm install                     # kakera is linked from ../kakera
npm run files                   # files/ (downloads the npm Sudachi build once, into .cache/)
npm test                        # Node tests (need .cache/ from the line above)
npm run test:types              # the TypeScript types
npm run build                   # dist/
node bin/wakachi.mjs copy-files test/files --from files
python3 -m http.server 8095     # open http://localhost:8095/test/analyzer.html, then Run checks
```

On an iPhone on the same Wi-Fi: serve with `--bind 0.0.0.0` and open `http://<this computer's IP>:8095/test/analyzer.html`.

Demo site: `npm run publish:demo` builds `demo/` (the test page with the files) and pushes it to the `gh-pages`
branch, served at https://pikapikagems.github.io/wakachi/ (`node scripts/publish-demo.mjs --build` only builds it).

A release will carry `npm pack`'s tarball (what apps install) and the contents of `files/` (what `copy-files`
downloads, from `https://github.com/PikaPikaGems/wakachi/releases/download/v<version>/`).

## Licence

MIT, see [LICENSE](LICENSE). Sudachi and its dictionary keep their own licence: [NOTICE.md](NOTICE.md).

The code started in [jp-tts-playground](https://github.com/PikaPikaGems/jp-tts-playground) (AGPL-3.0-or-later) and
is relicensed here under MIT by its author.
