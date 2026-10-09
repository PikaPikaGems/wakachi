# Pending

- [ ] **Files on another host.** Today the files must be on the same site as the page. The dictionary parts could
      come from any host that sends CORS headers (GitHub Pages does), but browsers refuse to start a worker from
      another origin, so `wakachi-worker.js` can't. Fix (in kakera): start the worker from a small same-origin blob that
      imports the remote script (the remote host then also needs CORS on that file). GitHub release downloads send no
      CORS headers, so a page can't load from a release directly; GitHub Pages or a CDN would work.
- [ ] **Speed.** Each Sudachi call costs ~125 ms whatever its length; `analyzeMany` batches texts to hide it. Cause
      (CPU profile, 2026-10-09): the npm build (sudachi@0.1.5, 2021, the latest on npm) rebuilds the tokenizer from
      the dictionary bytes on every call (`Tokenizer::from_dictionary_bytes`: 98% of the time, mostly
      `parse_trie_array`); the actual tokenizing is ~2%. It also looks like an unoptimized build. hata6502/sudachi-wasm's
      current source builds the dictionary once (thread_local), but there is no newer npm release: building it
      ourselves (Rust + wasm-pack) would make each call a few ms.
- [ ] Demo site: the `gh-pages` branch is pushed (`npm run publish:demo`); GitHub serves it at
      https://pikapikagems.github.io/wakachi/ once the repo is public.
- [ ] First GitHub release (v0.1.0) with `files/`: `copy-files` downloads from it by default. Needs the repo public.
- [ ] `wakachi/react`: `useAnalysis(text)`, `<Furigana text>`; React as an optional peer dependency.
- [ ] Test on a real iPhone (load, memory, speed).
- [ ] CI: Node tests and the browser test page.
- [ ] More reading fixes: 2,546 of jp-word-ranks-data's 37,608 kanji words still differ (most are single kanji out of
      context, or katakana words with no reading). Candidates: 今日は (こんにちは), 良い (いい), 体中 (からだじゅう).
