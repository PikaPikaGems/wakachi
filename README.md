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
await analyzer.load();                                  // 45 MB the first time, then from the device
await analyzer.furigana("私は明日10月4日に行く");
// → 私(わたし)は明日(あした)10(じゅう)月(がつ)4日(よっか)に行(い)く
await analyzer.analyze("猫が好き。");                     // words with readings, dictionary forms, parts of speech
```

React (optional, React 18 or later): `useWakachi(text)` and `useWakachiEngine()` from `wakachi/react`, in
[API.md §12](API.md#12-react).

## Nothing downloads until the user says so

The dictionary is a 45 MB download and ~135 MB of memory, so wakachi never fetches or loads it by itself:

- **Opening the page** downloads nothing big. Only a small `manifest.json` is read, when you ask for the size
  (`analyzer.info()`, or the React hooks), so you can show "Download (45 MB)".
- **Opting in:** only `load()` downloads (the first time) and loads into memory. Call it from something the user chose,
  like a button. Unused memory is freed by itself (after a minute, or when the page is in the background) and comes
  back from the device when needed, without downloading.
- **Opting out:** `clearCache()` ("Delete from device") deletes the files, frees the memory and turns the feature
  off everywhere on the page. Nothing downloads again until the next `load()`.

**Your app remembers the choice.** On every visit, even when the files are already on the device, wakachi starts as
`"not-loaded"` and waits for `load()`. To bring the feature back for a user who opted in before, save their choice
and call `load()` at startup. That reads from the device; nothing is downloaded:

```js
const analyzer = createAnalyzer();
const { cached } = await analyzer.info();
if (localStorage.getItem("wakachi") === "on" && cached) await analyzer.load();   // they said yes before

downloadButton.onclick = async () => { localStorage.setItem("wakachi", "on"); await analyzer.load(); };
deleteButton.onclick = async () => { localStorage.removeItem("wakachi"); await analyzer.clearCache(); };
```

With React, the same with `useWakachiEngine()`: `e.cached`, `e.load()` and `e.clearCache()`.

## What it adds to Sudachi

- **Everyday readings:** 私 わたし (not わたくし), 明日 あした, 日本 にほん, お母さん, 言う いう, and numbers read as numbers
  with their sound changes (10月 じゅうがつ, 一回 いっかい, 3本 さんぼん, 4日 よっか): [API.md § Readings](API.md#6-readings).
- **Plug and play:** one command (`wakachi copy-files`) puts the dictionary, in parts of at most 20 MB, and the worker
  in your `public/` folder. No bundler setup, no dependencies to install.
- **Phone protections:** loads only when you call `load()`, frees memory when idle or in the background, never
  crashes the same phone twice, times out instead of hanging, and keeps memory flat on long text.
- **Fast Sudachi:** our own optimized build (GitHub Actions, `.github/workflows/build-sudachi.yml`) of the current
  sudachi-wasm source: about 1 ms per sentence. The npm build (2021) rebuilt its dictionary on every call (~125 ms).

## How it fits together

```
page:   dist/wakachi.js        createAnalyzer(): reading fixes, furigana
          │  (kakera: one worker per page, crash guard, timeouts, idle/hidden unloading)
worker: wakachi-worker.js      Sudachi (wasm), safe input splitting, batching
          │  (kakera: parts downloaded once, checked, kept in IndexedDB)
files:  manifest.json + parts  Sudachi's program (1 MB) and dictionary (124 MB, 45 MB to download)
```

[kakera](https://github.com/PikaPikaGems/kakera) is the plumbing shared with
[yomiage](https://github.com/PikaPikaGems/yomiage) (Japanese text-to-speech); it is bundled in at build time.

## Layout

```
src/index.ts        createAnalyzer, AnalyzerError (page side)
src/worker.ts       Sudachi in the worker: streams the dictionary straight into its memory
src/analyze.ts      Sudachi's output to words: positions, URL/emoji protection, batching
src/readings.ts     everyday readings and numbers; the app's own readings
src/text.ts         wakachi/text: furigana, bunsetsu, sentences, labels
src/react.ts        wakachi/react: the hooks (React is an optional peer dependency)
src/react-state.ts  useWakachi()'s state without React, so Node tests can drive it
src/split-input.ts  cutting long text at sentence ends
src/pos.ts          Sudachi's part-of-speech tags to pos/tags
src/sudachi-glue.js wasm-bindgen glue of the Sudachi build (scripts/sudachi-build.mjs names it)
bin/wakachi.mjs     wakachi copy-files
scripts/            build.mjs (dist/), make-files.mjs (files/)
src/types.ts        public API types, checked against the implementation
dist/types/         generated declarations (index.d.ts, text.d.ts, react.d.ts, ...)
test/               Node tests; analyzer.html: try it + automatic checks in the browser;
                    react.html: the hooks in a small React app + automatic checks
```

## Development

Source is strict TypeScript. `npm run build` checks the source, bundles JavaScript, and generates declarations in
`dist/types/`. `npm test` builds first and tests compiled modules from `.cache/compiled/`. Generated Sudachi glue
and build scripts stay JavaScript.

```bash
npm ci --prefix ../kakera        # build the shared TypeScript dependency first
npm install                     # kakera is linked from ../kakera
npm run files                   # files/ (downloads our Sudachi build once, into .cache/)
npm test                        # Node tests (need .cache/ from the line above)
npm run test:types              # the TypeScript types
npm run build                   # dist/
node bin/wakachi.mjs copy-files test/files --from files
python3 -m http.server 8095     # open http://localhost:8095/test/analyzer.html, then Run checks
npm run build:test-react        # test/react-app.js for http://localhost:8095/test/react.html
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
