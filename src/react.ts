// wakachi/react: useWakachi(text) and useWakachiEngine(). See API.md §12.
//
// React is an optional peer dependency: only apps that import "wakachi/react" need it. The build keeps React and
// "./index.js" (the main bundle, so the page has one Sudachi) out of dist/react.js.
//
// No provider: every hook on the page uses one shared analyzer per filesUrl, so load() in one component loads it for
// all. The engine options (idleTimeout, crashGuard, ...) come from the first hook that uses that filesUrl.
import { useEffect, useState, useSyncExternalStore } from "react";
import { engineStore } from "kakera/store";
import { createAnalyzer } from "./index.js";
import { createReader, type WakachiEngineSnapshot, type WakachiEngineStore, type WakachiState } from "./react-state.js";
import type { Analyzer, AnalyzerOptions, AnalyzerStatus, LoadProgress } from "./types.js";

export type { WakachiState } from "./react-state.js";

/** Options for useWakachiEngine(): where the files are, and how the shared analyzer behaves. */
export type WakachiEngineOptions = Omit<AnalyzerOptions, "readings" | "everydayReadings">;
/** Options for useWakachi(): the engine options plus this component's own reading fixes. */
export type UseWakachiOptions = AnalyzerOptions;

/** What useWakachiEngine() returns. Same shape as yomiage's useYomiageEngine(). */
export interface WakachiEngine extends WakachiEngineSnapshot {
  /** Download if needed, then load into memory. Never rejects: a failure shows in `status` and `error`. */
  load(): Promise<void>;
  /** Free the memory, keep the files. */
  unload(): void;
  /** Delete the files from this device. */
  clearCache(): Promise<void>;
  /** Text to paste into a bug report. Never includes analyzed text. */
  debugReport(): Promise<string>;
}

const shared = new Map<string, { analyzer: Analyzer; store: WakachiEngineStore }>();

function sharedEngine({ readings: _r, everydayReadings: _e, ...options }: AnalyzerOptions = {}) {
  const key = options.filesUrl ?? "/wakachi/";
  let s = shared.get(key);
  if (!s) {
    // No reading fixes here: each useWakachi() applies its own.
    const analyzer = createAnalyzer({ ...options, everydayReadings: false });
    s = { analyzer, store: engineStore<AnalyzerStatus, LoadProgress>(analyzer) };
    shared.set(key, s);
  }
  return s;
}

/** The dictionary for a settings page: what is on the device and in memory, with buttons to change it. */
export function useWakachiEngine(options?: WakachiEngineOptions): WakachiEngine {
  const { store } = sharedEngine(options);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snap, load: store.load, unload: store.unload, clearCache: store.clearCache, debugReport: store.debugReport };
}

/**
 * Words, phrases and furigana of `text`, once the dictionary is loaded (by this or any other component). Nothing
 * loads by itself: with status "not-loaded", call `load()` from something the user chose.
 */
export function useWakachi(text: string, options?: UseWakachiOptions): WakachiState {
  const { analyzer, store } = sharedEngine(options);
  const [reader] = useState(() => createReader(store, analyzer));
  const { everydayReadings, readings } = options ?? {};
  const readingsKey = JSON.stringify([everydayReadings ?? true, readings ?? {}]);
  // Options first, then text, so the first analysis already uses them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reader.setOptions({ everydayReadings, readings }), [reader, readingsKey]);
  useEffect(() => reader.setText(text), [reader, text]);
  useEffect(() => { reader.start(); return reader.stop; }, [reader]);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  // `text` reaches the reader in an effect, after this render: already say stale in this one
  return state.status === "done" && !state.stale && reader.resultText() !== text ? { ...state, stale: true } : state;
}
