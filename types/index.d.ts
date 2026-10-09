// Types for wakachi. The API is described in API.md.

// ------------------------------------------------------------------------------------------------ results

/** Part of speech: Sudachi's first-level tag (all six levels are in `posDetail`). English: posInEnglish() from "wakachi/text". */
export type PosCategory =
  | "名詞" | "代名詞" | "動詞" | "形容詞" | "形状詞"   // noun, pronoun, verb, い-adjective, な-adjective stem (好き, 静か)
  | "副詞" | "連体詞" | "接続詞" | "感動詞"             // adverb, adnominal (この, 大きな), conjunction, interjection
  | "助詞" | "助動詞" | "接頭辞" | "接尾辞"             // particle, auxiliary (です, た), prefix (お-), suffix (-さん)
  | "補助記号" | "記号" | "空白"                       // punctuation (。「」), symbol, whitespace (spaces, line breaks)
  | (string & {});                                     // anything else Sudachi reports

/** Sub-tags a word can carry (from Sudachi's lower levels); the bunsetsu grouping and readings rely on them. */
export type PosTag =
  | "固有名詞"     // proper noun (東京, 田中)
  | "数詞"         // numeral (五, 5, 十)
  | "助数詞"       // can follow a number (分, 本, 人)
  | "非自立可能"   // helper use after another word (て + いる, 食べ + 始める)
  | "接続助詞"     // conjunctive particle (て, けど, から)
  | "括弧開"       // 「 ( 『
  | "括弧閉";      // 」 ) 』

export interface Morpheme {
  /** The text exactly as it appears in the input (even where Sudachi rewrites characters, e.g. ":" → "："). */
  surface: string;
  /** Reading in katakana. Empty string when there is none (unknown words, some loanwords, symbols). */
  reading: string;
  /** Dictionary form: 食べ → 食べる. Same as `surface` for words that don't inflect. */
  dictionaryForm: string;
  /** Spelling-normalized form: 附属 → 付属, かっこいい → 格好いい. */
  normalizedForm: string;
  pos: PosCategory;
  tags: PosTag[];
  /** Sudachi's original part-of-speech tags, e.g. ["名詞","普通名詞","一般","*","*","*"]. */
  posDetail: string[];
  /**
   * Position in the input string, as JavaScript string indices (UTF-16 units), so
   * `input.slice(m.start, m.end) === m.surface` always holds.
   */
  start: number;
  end: number;
}

// ------------------------------------------------------------------------------------------------ analyzer

export interface AnalyzerOptions {
  /** Where `wakachi copy-files` put the files. Relative URLs resolve against the page. Default "/wakachi/". */
  filesUrl?: string;
  /** Your own reading fixes, applied after the built-in ones: { "私": "わたくし" }. Readings in hiragana or katakana. */
  readings?: Record<string, string>;
  /** Built-in everyday readings (私→わたし, 明日→あした, 日本→にほん, numbers with counters...). Default true. */
  everydayReadings?: boolean;
  /**
   * Stop Sudachi (freeing its memory) after this many ms without a call. The next call reloads it from the device
   * without downloading anything. 0 = never stop. Default 60_000.
   */
  idleTimeout?: number;
  /**
   * Stop Sudachi while the page is hidden (another tab or app in front). iOS kills memory-heavy background tabs
   * first. The next call after the page is visible again reloads from the device. Default true.
   */
  stopWhenHidden?: boolean;
  /**
   * If loading crashed the tab (iOS kills the page when memory runs out), don't load again for a while: load()
   * rejects with "unavailable" instead, so the user never sees the same crash twice. `false` turns this off.
   * Default { retryAfterDays: 7 }.
   */
  crashGuard?: false | { retryAfterDays?: number };
  /**
   * Give up (and stop the worker) when things hang, instead of leaving the UI waiting forever. Both measure time
   * WITHOUT PROGRESS, so a slow download or a long text that is still moving never times out.
   */
  timeouts?: {
    /** load(): ms without download or startup progress. Default 60_000. */
    loadStall?: number;
    /** analyze()/furigana(): ms without finishing the next piece of text (up to 8,000 characters). Default 20_000. */
    analyzeStall?: number;
  };
  /** Ask the browser to keep the downloaded dictionary (navigator.storage.persist()). Default true. */
  persistStorage?: boolean;
}

export type AnalyzerStatus =
  | "not-loaded"   // load() has not been called (or dispose() was)
  | "downloading"  // fetching dictionary parts (first time, or the browser deleted them)
  | "loading"      // reading from the device and starting Sudachi
  | "ready"
  | "stopped"      // freed (idle, page hidden, or unload()); the next call reloads from the device by itself
  | "unavailable"  // loading crashed this tab recently (crash guard): show the page without analysis
  | "error";       // load() failed

/** One `progress` event: `stage` and `fraction` for the UI; the rest for debugging. */
export interface LoadProgress {
  stage: "downloading" | "preparing" | "ready";
  /** 0 → 1 over the whole load; never goes backwards. */
  fraction: number;
  /** What is happening right now. May change between versions: use it for debugging, not for logic. */
  step: string;
  /** Bytes for the current stage (downloaded / to download, or unpacked / all). */
  loaded?: number;
  total?: number;
  file?: string;
  part?: number;
  parts?: number;
  fileIndex?: number;
  files?: number;
  downloaded?: number;
  toDownload?: number;
  unpacked?: number;
  toUnpack?: number;
  /** Milliseconds since loading started. */
  ms: number;
}

/** One step of a load, with how long it took. */
export interface LoadTiming {
  step: string;
  file?: string;
  part?: number;
  /** Start, in ms since loading started. */
  at: number;
  /** Duration in ms. */
  ms: number;
}

export interface FilesInfo {
  /** The dictionary is stored on this device: load() won't download anything. */
  cached: boolean;
  /** Size of the download when not cached (compressed). */
  downloadBytes: number;
  /** downloadBytes in MB, rounded, for messages like "Download the dictionary (43 MB)?" */
  downloadMB: number;
}

export interface LoadResult {
  /** true when nothing was downloaded. */
  fromCache: boolean;
  /** How long the load took (absent when Sudachi was already loaded). */
  ms?: number;
  timings?: LoadTiming[];
}

export interface CallOptions {
  /** Abort this call; its promise rejects with a DOMException named "AbortError". */
  signal?: AbortSignal;
}

export interface Analyzer {
  readonly status: AnalyzerStatus;

  /** Is the dictionary on this device, and how big is the download if not? Reads the small manifest file. */
  info(): Promise<FilesInfo>;

  /**
   * Download (first time) or read from the device, start Sudachi and warm it up. Resolves when calls are fast.
   * Calling it again while loading returns the same promise; calling it when ready resolves immediately.
   * Rejects with AnalyzerError ("unavailable" after a recent crash, "download-failed", ...).
   */
  load(): Promise<LoadResult>;

  /** Furigana for a whole text: joined, the `text` fields are exactly the input. */
  furigana(text: string, options?: CallOptions): Promise<RubySegment[]>;

  /**
   * Words of one text. Long texts are analyzed in pieces internally (Sudachi's memory never shrinks, so one huge
   * call would keep it large); the result is the same. Rejects with AnalyzerError("not-loaded") before load().
   */
  analyze(text: string, options?: CallOptions): Promise<Morpheme[]>;
  /** Several texts in one trip to the worker. Result i belongs to texts[i]. */
  analyzeMany(texts: string[], options?: CallOptions): Promise<Morpheme[][]>;

  /** Delete the dictionary from this device. Does not stop a running Sudachi. */
  clearCache(): Promise<void>;
  /** Forget a recorded crash so the next load() tries again (e.g. behind a "Try again" button). */
  resetCrashGuard(): void;

  /** Free the memory now (if no other analyzer on the page needs it). The next call reloads from the device. */
  unload(): void;
  /** Stop and forget everything; the analyzer goes back to "not-loaded". Pending calls reject. */
  dispose(): void;

  /** Subscribe to changes. Returns an unsubscribe function. */
  on(event: "status", listener: (status: AnalyzerStatus) => void): () => void;
  on(event: "progress", listener: (progress: LoadProgress) => void): () => void;
  /** Each loading step as a line of text, for debugging. */
  on(event: "log", listener: (line: string) => void): () => void;
}

export declare function createAnalyzer(options?: AnalyzerOptions): Analyzer;

export declare const VERSION: string;

// ------------------------------------------------------------------------------------------------ errors

export type AnalyzerErrorCode =
  | "not-loaded"            // a call before load()
  | "disposed"              // the analyzer was disposed while the call was pending
  | "unavailable"           // load(): loading crashed this tab recently (crash guard); see resetCrashGuard()
  | "unsupported-browser"   // no WebAssembly / DecompressionStream / IndexedDB
  | "download-failed"       // network or HTTP error (includes files missing at filesUrl)
  | "checksum-mismatch"     // a downloaded part was corrupt
  | "out-of-memory"         // the browser refused Sudachi's memory (checked before downloading)
  | "timeout"               // load() or a call made no progress for too long; the worker was stopped
  | "engine-failed"         // Sudachi failed in an unexpected way (e.g. its worker file could not load)
  | "worker-crashed";       // the worker died after loading

export declare class AnalyzerError extends Error {
  readonly code: AnalyzerErrorCode;
  constructor(code: AnalyzerErrorCode, message: string, options?: { cause?: unknown });
}

// ------------------------------------------------------------------------------------------------ furigana

/** One piece of furigana: `reading` (hiragana) is set on kanji/number runs only. */
export interface RubySegment {
  text: string;
  reading?: string;
}
