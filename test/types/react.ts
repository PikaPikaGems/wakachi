// Compiled by `npm run test:types` (never run): the hooks' types narrow by status and reject mistakes.
import { useWakachi, useWakachiEngine, type WakachiState, type WakachiEngine } from "wakachi/react";
import { furiganaOf } from "wakachi/text";

export function Reader({ text }: { text: string }): string {
  const w: WakachiState = useWakachi(text, { readings: { "私": "わたくし" }, filesUrl: "/wakachi/" });
  // @ts-expect-error  words exist only once status is "done"
  console.log(w.words);
  switch (w.status) {
    case "not-loaded": void w.load(); return w.cached ? "Turn on" : `Download (${w.downloadMB ?? "?"} MB)`;
    case "loading": return `${w.progress.stage} ${w.progress.fraction}`;
    case "unavailable": return w.reason;
    case "error": w.retry(); return w.error.message;
    case "done": return `${w.stale} ${w.bunsetsu.length} ${w.furigana.length} ` +
      furiganaOf(w.words).map((s) => s.reading ?? s.text).join("");
  }
}

export function Row(): string {
  const e: WakachiEngine = useWakachiEngine({ idleTimeout: 0 });
  if (e.status === "not-loaded") void e.load();
  if (e.status === "ready") e.unload();
  if (e.cached) void e.clearCache();
  void e.debugReport().then((t: string) => t);
  return `${e.downloadMB} ${e.progress?.fraction} ${e.error?.message}`;
}

// @ts-expect-error  reading fixes belong to useWakachi(), not the shared engine
useWakachiEngine({ readings: {} });
// @ts-expect-error  useWakachi takes a string
useWakachi(42);
