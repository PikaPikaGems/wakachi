# wakachi API

Japanese text analysis in the browser — furigana, readings, dictionary forms, parts of speech — that works on iPhone
Safari. It runs [Sudachi](https://github.com/WorksApplications/sudachi.rs) in a Web Worker; the dictionary is
downloaded once (in parts, so any static host works) and kept on the device.

*wakachi* comes from 分かち書き (*wakachi-gaki*): writing Japanese with spaces between the words.

| Import | What it gives you |
|---|---|
| `wakachi` | `createAnalyzer`, `AnalyzerError`, `VERSION`, types |
| `wakachi/text` | Furigana, bunsetsu, sentence splitting: pure functions, no worker, no dictionary (§9) |
| `wakachi/react` *(later)* | `useAnalysis(text)`, `<Furigana text>` |

The quickest possible use:

```js
import { createAnalyzer } from "wakachi";

const analyzer = createAnalyzer();
await analyzer.load();
const ruby = await analyzer.furigana("今日は晴れ");
// → [{ text: "今日", reading: "きょう" }, { text: "は" }, { text: "晴", reading: "は" }, { text: "れ" }]
```

---

## 1. Setup (once per project)

```bash
npm install <wakachi release URL>
```

Add the dictionary files to the project with one command, and run it automatically before the dev server and builds:

```json
"scripts": {
  "predev": "wakachi copy-files public/wakachi",
  "prebuild": "wakachi copy-files public/wakachi"
}
```

- The files (45 MB to download) come from this version's GitHub release, are checked, and are cached on your computer
  (`~/.cache/wakachi`); after the first time the command only copies them. `--from <url or folder>` takes them from
  elsewhere.
- They are split into parts of at most 20 MB, so they work on GitHub Pages and Cloudflare Pages (25 MiB per file).
- The folder also gets `wakachi-worker.js` (Sudachi's worker) and `THIRD-PARTY-LICENSES.md`. The page starts the
  worker from there, so your bundler never sees it: no configuration, and no dependencies to install.
- Add `public/wakachi/` to `.gitignore`.
- Vite, Next.js and Create React App serve `public/` at the site root, so the files end up at `/wakachi/`: the
  default the analyzer looks in.

## 2. Create an analyzer

```js
const analyzer = createAnalyzer();
```

Creating it **does nothing**: no download, no worker, no memory. Options, all optional:

| Option | Default | What it does |
|---|---|---|
| `filesUrl` | `"/wakachi/"` | Where `copy-files` put the files, if not the default. Can be another site, e.g. `"https://example.github.io/wakachi-files/"`, if it sends CORS headers (GitHub Pages and CDNs do; GitHub release links don't) |
| `everydayReadings` | `true` | Correct readings Sudachi gets formal or wrong for everyday text (§6). `false`: Sudachi's own |
| `readings` | `{}` | Your own reading fixes, e.g. `{ "私": "わたくし" }` (§6) |
| `idleTimeout` | `60_000` | Free the memory after this many ms unused. `0` = never |
| `stopWhenHidden` | `true` | Free the memory while the page is in the background (iOS kills heavy background tabs first) |
| `crashGuard` | `{ retryAfterDays: 7 }` | Don't load again right after a load crashed the tab (§8). `false` = off |
| `timeouts` | `{ loadStall: 60_000, analyzeStall: 20_000 }` | Give up instead of hanging (§8) |
| `persistStorage` | `true` | Ask the browser to keep the downloaded dictionary |

After an idle or background stop, the next call reloads from the device (about 0.5–2 s, no download). Nothing to do.

**One Sudachi per page.** It uses ~135 MB, so every analyzer on the page shares the same one. Create analyzers
wherever convenient (e.g. one per component, each with its own `readings`); Sudachi is loaded once.

## 3. Load, when you decide

Nothing is downloaded or loaded until `load()`. Calling `analyze()` first rejects with `AnalyzerError("not-loaded")`.

```js
const { cached, downloadMB } = await analyzer.info();
if (!cached && !confirm(`Download the Japanese dictionary (${downloadMB} MB)?`)) return;

const off = analyzer.on("progress", ({ stage, fraction }) => showBar(stage, fraction));
try {
  const { fromCache } = await analyzer.load();    // fromCache: nothing was downloaded
} catch (err) {
  if (err.code === "unavailable") showPlainText(); // it crashed this device before: see §8
  else showError(err.message);
} finally {
  off();
}
```

- `load()` also warms Sudachi up, so the first `analyze()` afterwards is fast.
- Calling `load()` while it's loading returns the same promise; when ready it resolves at once.

### Progress

One `progress` event covers the whole load, so a single bar works whether or not the files have to be downloaded:

| Field | What it is |
|---|---|
| `stage` | `"downloading"` (while parts are still arriving: the first time, and whenever the browser has deleted the files since), `"preparing"` (unpacking and starting Sudachi; every load), `"ready"` (once, at the end). Stable: use it for labels |
| `fraction` | 0 → 1 for the whole load, never going backwards |
| `loaded`, `total` | Bytes for the current stage: downloaded / to download, or unpacked / all |
| `step` | What is happening right now, for debugging (may change between versions): `read` (a part from the device), `download`, `verify`, `store`, `unpack`, `file-done`, then `start-sudachi`, `warm-up` and `ready` |
| `file`, `part`, `parts`, `fileIndex`, `files` | Which file and part the step is working on |
| `downloaded`, `toDownload`, `unpacked`, `toUnpack` | The raw byte counts behind `fraction` |
| `ms` | Milliseconds since loading started |

When the files are on the device, the bar moves by time: each load remembers how long each step took on this device.
For debugging, `load()` also resolves `timings` (every step with its file, part, start `at` and duration `ms`), and
`analyzer.on("log", fn)` gets a line per step (`"0.21 s  unpack dict.bin part 3/6"`).

The files stay on the device until the browser deletes them: Safari does that after about 7 days of browsing without
visiting the site (except for web apps added to the Home Screen), other browsers when storage runs low. The next
`load()` then downloads again, and `info()` reports `cached: false` beforehand.

### Status

```js
analyzer.on("status", (s) => render(s));   // returns an unsubscribe function
analyzer.status;                           // current value
```

`not-loaded` → `downloading` (only when not on the device yet) → `loading` → `ready` ⇄ `stopped` (memory freed;
reloads by itself). `unavailable`: crash guard (§8). `error`: loading failed.

## 4. Furigana

```js
const ruby = await analyzer.furigana("食べた後で");
// → [{ text: "食", reading: "た" }, { text: "べた" }, { text: "後", reading: "あと" }, { text: "で" }]
```

- Readings (hiragana) sit on the kanji and numbers only; kana next to them (okurigana) is left alone.
- Joining every `text` gives back the exact input.
- Uses the everyday readings (§6).

```js
el.innerHTML = ruby.map((s) => s.reading ? `<ruby>${s.text}<rt>${s.reading}</rt></ruby>` : s.text).join("");
// (escape s.text if the input isn't yours)
```

For richer displays (word spacing, colours by part of speech, dictionary forms on tap), use `analyze()` and the
helpers in `wakachi/text` (§9).

## 5. Analyze

```js
const words = await analyzer.analyze("猫が好き。");
```

```js
[
  { surface: "猫", reading: "ネコ", dictionaryForm: "猫", normalizedForm: "猫",
    pos: "noun", tags: [], posDetail: ["名詞","普通名詞","一般","*","*","*"], start: 0, end: 1 },
  { surface: "が", reading: "ガ", dictionaryForm: "が", normalizedForm: "が",
    pos: "particle", tags: [], posDetail: ["助詞","格助詞","*","*","*","*"], start: 1, end: 2 },
  { surface: "好き", reading: "スキ", dictionaryForm: "好き", normalizedForm: "好き",
    pos: "adjectival-noun", tags: [], posDetail: ["形状詞","一般","*","*","*","*"], start: 2, end: 4 },
  { surface: "。", reading: "", dictionaryForm: "。", normalizedForm: "。",
    pos: "punctuation", tags: [], posDetail: ["補助記号","句点","*","*","*","*"], start: 4, end: 5 },
]
```

Many texts in one trip to the worker (e.g. one per line):

```js
const perLine = await analyzer.analyzeMany(text.split("\n"));   // perLine[i] belongs to line i
```

`analyzeMany` saves the trips to the worker; Sudachi itself is fast (a sentence takes about 1 ms on a Mac).

Guarantees:
- **Nothing is dropped or changed.** Joining every `surface` gives back the exact input, spaces and line breaks
  included (`pos: "whitespace"`). `input.slice(w.start, w.end) === w.surface`. Sudachi rewrites some characters
  internally (`:` → `：`); `surface` is always your original text.
- `start`/`end` are ordinary JavaScript string positions.
- `reading` is katakana, or `""` when there is none (punctuation, symbols, Latin words; use `surface` then).
- **Long text is fine.** Sudachi's memory never shrinks — one 50,000-character call would grow it from 150 MB to
  234 MB for good — so long text is analyzed in pieces of ≤ 8,000 characters, cut at sentence ends. Memory stays at
  ~135 MB.
- **URLs, emoji and long latin runs are fine.** (Older Sudachi builds crashed on them.) As a safety net, a piece that
  makes Sudachi fail is split and retried, so one odd stretch never loses the whole text.

| `pos` | Meaning |
|---|---|
| `noun`, `pronoun`, `verb` | |
| `adjective` | い-adjective |
| `adjectival-noun` | な-adjective stem (好き, 静か) |
| `adverb`, `conjunction`, `interjection`, `filler` | |
| `adnominal` | 連体詞 (この, 大きな) |
| `particle` | は, が, を, ね |
| `auxiliary` | 助動詞 (です, ます, た) |
| `prefix`, `suffix` | お-, -さん |
| `punctuation` | 。、「」 |
| `symbol`, `whitespace`, `other` | |

| `tags` | Meaning |
|---|---|
| `proper` | proper noun (東京, 田中) |
| `numeral` | 五, 5 |
| `counter` | can follow a number (分, 本, 人) |
| `dependent` | helper use after another word (て**いる**, 食べ**始める**) |
| `conjunctive` | conjunctive particle (て, けど) |
| `bracket-open`, `bracket-close` | 「 」 ( ) |

`posDetail` is Sudachi's own UniDic-style tag list, for anyone who needs more detail than `pos` and `tags`.

### Cancelling

```js
let ctrl;
textbox.oninput = async () => {
  ctrl?.abort();                        // cancel MY previous call only
  ctrl = new AbortController();
  try {
    render(await analyzer.furigana(textbox.value, { signal: ctrl.signal }));
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
};
```

Older calls are **not** cancelled automatically: Sudachi is shared, so one component's call must never cancel
another's.

## 6. Readings

Sudachi's dictionary prefers formal or rare readings for some very common words, and reads numbers digit by digit.
With `everydayReadings` (on by default) wakachi corrects them. The word fixes come from comparing Sudachi with the
53,000 words of [jp-word-ranks-data](https://github.com/PikaPikaGems/jp-word-ranks-data): of its 37,608 words with
kanji, Sudachi reads 2,889 differently from the list, wakachi 2,512 (top 10,000: 539 → 411). Most of the rest are
single kanji out of context (年, 月, 方), where Sudachi's choice is fine in a sentence, and katakana words Sudachi gives
no reading.

| Text | Sudachi | wakachi |
|---|---|---|
| 私, 私たち | わたくし | わたし (私ども stays わたくしども) |
| 明日 | あす | あした |
| 日本, 日本語, 日本人, 外国人 | にっぽん, にっぽんにん, がいこくにん | にほん, にほんじん, がいこくじん |
| お母さん, お父さん, お兄ちゃん, 姉さん | おははさん, おちちさん, おあにちゃん, あねさん | おかあさん, おとうさん, おにいちゃん, ねえさん |
| 言う, と言う | ゆう | いう |
| 何か, 何も, 何が | なんか, なんも, なんが | なにか, なにも, なにが (何で, 何の stay なん) |
| 何人, 何分 | なにじん, なんふん | なんにん, なんぷん |
| 一度 | ひとたび | いちど |
| 株式会社, 保険会社, 誕生日, 金曜日, 気に入る | …かいしゃ, たんじょうひ, きんようひ, きにはいる | …がいしゃ, たんじょうび, きんようび, きにいる |
| 社会人, 研究所, 世界中, 予定通り | しゃかいにん, けんきゅうしょ, せかいちゅう, よていとおり | しゃかいじん, けんきゅうじょ, せかいじゅう, よていどおり (管理人, 事務所, 会議中, その通り unchanged) |
| 私生活 | わたくしせいかつ | しせいかつ (and names like 日本銀行 keep にっぽん) |
| 或いは, 若しくは | あるいわ, もしくわ | あるいは, もしくは |

**Numbers** become one word with the reading of the whole number, and the counter after it gets its sound change:

| Text | Sudachi | wakachi |
|---|---|---|
| 10月, 2026年 | いちれいがつ, にれいにろくねん | じゅうがつ, にせんにじゅうろくねん |
| 30分, 8分, 4分 | さんれいふん, はちふん, よんふん | さんじゅっぷん, はっぷん, よんぷん |
| 一回, 100回, 3階 | いちかい, いちれいれいかい, さんかい | いっかい, ひゃっかい, さんがい |
| 六本, 4本, 何本 | ろくぽん, よんぽん, なんぽん | ろっぽん, よんほん, なんぼん |
| 8歳, 一週間 | はちさい, いちしゅうかん | はっさい, いっしゅうかん |
| 4日, 20日, 29日, 4月1日 | よんか, にれいにち, にきゅうにち, よんがつついたち | よっか, はつか, にじゅうくにち, しがつついたち |
| 4時, 9時, 4人 | よんじ, きゅうじ, よんにん | よじ, くじ, よにん |
| 1,000円, 3.14, ０１２ | いちれいれいれいえん, さん．いちよん, れいいちに | せんえん, さんてんいちよん, ぜろいちに |

Counters with sound changes: 回 個 階 課 ヶ月 曲 件 軒 校, 歳 冊 週 週間 通 着 頭 点 足, 本 杯 匹 分 泊 発 歩 票 品, 時 時間 年 円
月 人 日 つ. After other counters, the number is corrected and the counter keeps Sudachi's reading.

Add or change your own; they are applied last, so they win:

```js
createAnalyzer({ readings: { "私": "わたくし", "大分": "おおいた" } });
```

- Keys are matched against whole words. A key Sudachi splits into several words (お母さん = お + 母 + さん) works too;
  those words become one.
- Readings can be hiragana or katakana (`reading` fields are always katakana).
- Each analyzer has its own; they share one Sudachi.

## 7. Freeing memory and storage

```js
analyzer.unload();                // free the memory now; the next call reloads from the device
analyzer.dispose();               // back to "not-loaded": pending calls reject, load() needed again
await analyzer.clearCache();      // delete the dictionary from this device
```

Sudachi is freed only when no analyzer on the page still needs it.

## 8. When things go wrong

The aim: **the page never freezes, the user never sees the same crash twice, and you always get a clear error.**

- **No freezing.** Everything heavy runs in a Web Worker. The one freeze risk is on your side: inserting thousands of
  furigana elements at once. Render long results in batches.
- **Never the same crash twice.** When iOS runs out of memory it kills the tab and reloads it; no code gets to react.
  So wakachi leaves a note before loading and removes it once loaded. If the page comes back with the note still
  there, the load crashed the tab: for the next `retryAfterDays` (default 7), `load()` rejects with `unavailable`
  at once (status `unavailable`) instead of crashing again. Show the page without furigana.
  `analyzer.resetCrashGuard()` (e.g. behind a "Try again" button) clears it.
- **Out of memory, checked before downloading.** Sudachi's memory is reserved before the dictionary is downloaded. If
  the browser refuses, `load()` fails at once with `out-of-memory`, without a wasted 45 MB download.
- **Timeouts measure time without progress**, so slow-but-working never times out. `loadStall` (60 s): no download or
  startup progress. `analyzeStall` (20 s): no piece of text (up to 8,000 characters, normally under a second)
  finished. Either way the worker is stopped and the call rejects with `timeout`; the next call starts fresh.
- **Missing files say so:** `…/wakachi-worker.js is missing: run "wakachi copy-files" into the folder served at that
  address`. Files from another wakachi version than the page's ask you to run `copy-files` again.

Every failure is an `AnalyzerError` with a `code`:

| `code` | When |
|---|---|
| `not-loaded` | `analyze()` / `furigana()` before `load()` |
| `disposed` | the analyzer was disposed while the call was pending |
| `unavailable` | `load()`: loading crashed this tab recently (crash guard) |
| `unsupported-browser` | missing WebAssembly, DecompressionStream (Safari 16.4+) or IndexedDB |
| `download-failed` | network/HTTP error, including files not found at `filesUrl` |
| `checksum-mismatch` | a downloaded part was corrupt |
| `out-of-memory` | the browser refused the memory (checked before downloading) |
| `timeout` | `load()` or a call made no progress for too long |
| `engine-failed` | Sudachi failed unexpectedly (e.g. its worker file is missing) |
| `worker-crashed` | the worker died after loading |

## 9. Text helpers: `wakachi/text`

Pure functions on the results of `analyze()`:

```js
import { furigana, furiganaOf, groupBunsetsu, splitSentences, toHiragana, posLabel } from "wakachi/text";

furigana(word);          // 食べ (タベ) → [{ text: "食", reading: "た" }, { text: "べ" }]
furiganaOf(words);       // the same for a whole analysis (what analyzer.furigana() returns)
groupBunsetsu(words);    // → [{ morphemes, head, headDictionaryForm, start, end }, ...]
splitSentences(text);    // → [{ text, start, end }]; keeps 「行こう！」と彼は言った。 as one sentence
toHiragana("ネコ");       // "ねこ"
posLabel(word);          // "Verb, general" (posLabel(word, "ja") → "動詞・一般")
```

`groupBunsetsu` is approximate (part-of-speech rules): compound nouns and some verb chains occasionally split or
merge oddly.

## 10. Memory on iPhone Safari

- Sudachi uses about **135 MB** while loaded, plus about one dictionary part (≤ 20 MB) while loading.
- iOS has no fixed per-tab limit. Reported crash points are around 1.5 GB (iPhone 12 Pro) to 3 GB (iPhone 15 Pro) for
  the **whole page**, lower on older phones and when other apps use memory.
- The risk is everything on the page together. With a voice (e.g. yomiage) on the same page, load one, then the
  other, not both at the same moment.
- Every tab of your site loads its own copy.

## 11. TypeScript

Types come with the package (`types/index.d.ts`, `types/text.d.ts`): `Morpheme`, `RubySegment`, `AnalyzerOptions`,
`LoadProgress`, `AnalyzerError` and the rest.

## 12. React *(later)*

`wakachi/react` will wrap the analyzer: `useAnalysis(text)` (cancels its own outdated calls, renders long results in
batches) and `<Furigana text>`. React will be an optional peer dependency, so plain-JS apps never need it.
