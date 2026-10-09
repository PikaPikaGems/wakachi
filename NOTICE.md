# Third-party notices

wakachi's own code is MIT-licensed (see [LICENSE](LICENSE)). It downloads and runs the components below, which keep
their own licences.

| Component | Use | Licence |
|---|---|---|
| [Sudachi](https://github.com/WorksApplications/sudachi.rs) (sudachi.rs) with the [SudachiDict](https://github.com/WorksApplications/SudachiDict) "small" dictionary (20260723), compiled to WebAssembly from [hata6502/sudachi-wasm](https://github.com/hata6502/sudachi-wasm) (commit 60d6e1c) by this repository's `build-sudachi` workflow | morphological analysis: words, readings, dictionary forms, parts of speech | Apache-2.0. SudachiDict incorporates UniDic (BSD-3-Clause) and NEologd data: see the [SudachiDict licence](https://github.com/WorksApplications/SudachiDict#license) and the [sudachi-wasm notes](https://github.com/hata6502/sudachi-wasm#disclaimer) |

wakachi splits that WebAssembly file into the program and its dictionary data (so the browser can stream the data
into memory) and does not otherwise modify them. The Apache-2.0 licence text is in `THIRD-PARTY-LICENSES.md`, which
`wakachi copy-files` puts next to the worker (`wakachi-worker.js`) so it ships with your site.

The everyday-readings corrections (`src/readings.js`) were chosen by comparing Sudachi's readings with
[PikaPikaGems/jp-word-ranks-data](https://github.com/PikaPikaGems/jp-word-ranks-data); no data from it is included.
