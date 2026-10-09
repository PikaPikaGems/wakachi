# Pending

- [x] **Files on another host** (2026-10-09): `filesUrl` can be another site that sends CORS headers; kakera starts
      the worker through a small same-origin script. Tested with two local origins.
- [x] **Speed** (2026-10-09): the npm Sudachi build (2021) rebuilt its dictionary on every call (~125 ms) and was a debug
      build. wakachi now uses its own optimized build of the current sudachi-wasm source with SudachiDict small
      20260723 (`.github/workflows/build-sudachi.yml`, a pre-release named in scripts/sudachi-build.mjs): ~1 ms per
      sentence, 63,000 characters in 0.25 s. To update Sudachi or the dictionary: run the workflow, change
      sudachi-build.mjs, copy the new glue to src/sudachi-glue.js, `npm run files`, run the tests and the readings check.
- [x] Demo site: https://pikapikagems.github.io/wakachi/ (`npm run publish:demo` updates it).
- [x] First release: v0.1.0 (pre-release, 2026-10-09) with the tarball and `files/`; the playground installs from it.
      Next releases: bump the version, `npm pack`, `gh release create v<version> wakachi-<version>.tgz files/*`.
- [ ] `wakachi/react`: `useWakachi(text)` and `useWakachiEngine()`, designed in API.md §12; React as an optional peer
      dependency. No `<Furigana>` component: API.md shows the few lines with `furiganaOf`.
- [ ] `debugReport()` (from kakera), API.md §12.
- [x] English part-of-speech names checked (2026-10-09) against the UniDic English tagset and SudachiDict's own
      tag list: added the 4 missing suffix kinds (名詞的, 動詞的, 形容詞的, 形状詞的), removed 4 tags Sudachi never
      uses, clearer wording for 非自立可能 and the 可能 tags. A test checks the list stays complete.
- Decided: punctuation and symbols keep an empty reading (no fallback to the surface).
- [ ] Test on a real iPhone (load, memory, speed).
- [ ] CI: Node tests and the browser test page.
- [ ] More reading fixes: 2,303 of jp-word-ranks-data's 37,608 kanji words still differ (261 in the top 10,000; `node scripts/check-readings.mjs`) (most are single kanji out of
      context, or katakana words with no reading). Candidates: 今日は (こんにちは), 良い (いい), 体中 (からだじゅう).
