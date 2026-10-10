// The state behind wakachi/react's useWakachi(text), without React (react.ts is the thin hook on top), so Node tests
// can drive it with a fake engine.
//
// All hooks on a page share one analyzer per filesUrl (react.ts), made without reading fixes; each hook applies its
// own `everydayReadings` / `readings` here. Nothing loads by itself: analysis starts only once the shared analyzer
// has been loaded (by any component); before that the hook offers load().
import type { Analyzer, AnalyzerStatus, Bunsetsu, LoadProgress, Morpheme, RubySegment } from "./types.js";
import { checkReadings, fixReadings } from "./readings.js";
import { furiganaOf, groupBunsetsu } from "./text.js";

// Declared here rather than imported from kakera: kakera is bundled, so the published types can't refer to it.
/** The shared dictionary's state (kakera's engineStore() snapshot). */
export interface WakachiEngineSnapshot {
  status: AnalyzerStatus;
  /** The files are on this device. null until known (a moment after mounting). */
  cached: boolean | null;
  /** Download size in MB when not cached. null until known. */
  downloadMB: number | null;
  /** The latest progress while downloading or loading, otherwise null. */
  progress: LoadProgress | null;
  /** The last load() error, until the next load() starts or the dictionary is ready. */
  error: Error | null;
}

/** kakera's engineStore() for the shared analyzer. */
export interface WakachiEngineStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): WakachiEngineSnapshot;
  load(): Promise<void>;
  unload(): void;
  clearCache(): Promise<void>;
  debugReport(): Promise<string>;
}

/** What useWakachi() returns: the fields depend on `status`. */
export type WakachiState =
  | {
    status: "not-loaded";
    /** Download if needed, then load (for every component on the page). Call it from something the user chose. */
    load: () => Promise<void>;
    /** The dictionary is on this device. null until known (a moment after mounting). */
    cached: boolean | null;
    /** Download size in MB. null until known. */
    downloadMB: number | null;
  }
  | { status: "loading"; progress: LoadProgress }
  | {
    status: "done";
    words: Morpheme[];
    bunsetsu: Bunsetsu[];
    furigana: RubySegment[];
    /** true while a newer `text` is being analyzed: these results are still for the previous one. */
    stale: boolean;
  }
  | { status: "unavailable"; reason: string }
  | { status: "error"; error: Error; retry: () => void };

export interface ReadingOptions {
  everydayReadings?: boolean;
  readings?: Record<string, string>;
}

interface Result { text: string; key: string; words: Morpheme[]; bunsetsu: Bunsetsu[]; furigana: RubySegment[] }

const progressFor = (status: AnalyzerStatus, p: LoadProgress | null): LoadProgress =>
  p ?? { stage: status === "downloading" ? "downloading" : "preparing", fraction: status === "downloading" ? 0 : 1, step: status, ms: 0 };

/** One useWakachi() instance. start() / stop() follow the component's mount (React may run them twice). */
export function createReader(store: WakachiEngineStore, analyzer: Pick<Analyzer, "analyze">) {
  let text = "";
  let options = { everydayReadings: true, readings: {} as Record<string, string> };
  let key = "";
  let result: Result | null = null;
  let running: AbortController | null = null;
  let runningFor = "";
  let error: Error | null = null;
  let snap: WakachiState | null = null;
  let seen: ReturnType<typeof store.getSnapshot> | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const loaded = (s: AnalyzerStatus) => s === "ready" || s === "stopped";

  function changed() {
    snap = null;
    for (const fn of [...listeners]) fn();
  }

  /** Analyze the current text if it hasn't been (or isn't being) already. */
  function maybeRun() {
    if (!unsubscribe || error || !loaded(store.getSnapshot().status)) return;
    const want = `${key}\u0000${text}`;
    if (result && result.key === key && result.text === text) { running?.abort(); running = null; return; }
    if (running && runningFor === want) return;
    running?.abort(); // drop the answer for outdated text
    const ctrl = (running = new AbortController());
    runningFor = want;
    const forText = text, forKey = key, opts = options;
    analyzer.analyze(forText, { signal: ctrl.signal }).then((raw) => {
      if (ctrl.signal.aborted) return;
      running = null;
      const words = fixReadings(raw, opts);
      result = { text: forText, key: forKey, words, bunsetsu: groupBunsetsu(words), furigana: furiganaOf(words) };
      changed();
      maybeRun();
    }, (err) => {
      if (ctrl.signal.aborted) return;
      running = null;
      // "disposed": the files were deleted (clearCache()); the status says "not-loaded" now, not an error
      if ((err as { code?: unknown } | null)?.code !== "disposed") error = err instanceof Error ? err : new Error(String(err));
      changed();
    });
    changed();
  }

  function retry() {
    error = null;
    changed();
    if (loaded(store.getSnapshot().status)) maybeRun();
    else void store.load(); // maybeRun() follows when the store says it's loaded
  }

  function compute(): WakachiState {
    const e = store.getSnapshot();
    if (e.status === "unavailable") return { status: "unavailable", reason: e.error?.message ?? "loading the dictionary crashed this device recently" };
    if (error) return { status: "error", error, retry };
    if (e.status === "error") return { status: "error", error: e.error ?? new Error("the dictionary could not be loaded"), retry };
    if (e.status === "not-loaded") return { status: "not-loaded", load: store.load, cached: e.cached, downloadMB: e.downloadMB };
    if (!loaded(e.status) || !result) return { status: "loading", progress: progressFor(e.status, e.progress) };
    const { words, bunsetsu, furigana } = result;
    return { status: "done", words, bunsetsu, furigana, stale: result.text !== text || result.key !== key };
  }

  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** The text the current result belongs to ("" before the first result). */
    resultText: () => result?.text ?? "",
    getSnapshot() {
      // also recompute when the shared engine changed before start() subscribed (between render and effect)
      if (!snap || store.getSnapshot() !== seen) { seen = store.getSnapshot(); snap = compute(); }
      return snap;
    },
    setText(t: string) {
      if (typeof t !== "string") throw new TypeError("useWakachi() takes a string");
      if (t === text) return;
      text = t;
      error = null;
      changed();
      maybeRun();
    },
    setOptions({ everydayReadings = true, readings = {} }: ReadingOptions) {
      const next = JSON.stringify([everydayReadings, readings]);
      if (next === key) return;
      options = { everydayReadings, readings: checkReadings(readings) };
      key = next;
      error = null;
      changed();
      maybeRun();
    },
    start() {
      if (unsubscribe) return;
      unsubscribe = store.subscribe(() => { changed(); maybeRun(); });
      maybeRun();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      running?.abort();
      running = null;
    },
  };
}
