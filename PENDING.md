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
- [ ] Test on a real iPhone (load, memory, speed).
- [ ] CI: Node tests and the browser test page.
- [ ] More reading fixes: 2,512 of jp-word-ranks-data's 37,608 kanji words still differ (most are single kanji out of
      context, or katakana words with no reading). Candidates: 今日は (こんにちは), 良い (いい), 体中 (からだじゅう).
