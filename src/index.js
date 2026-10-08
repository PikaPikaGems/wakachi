// wakachi, page side: createAnalyzer, AnalyzerError. See API.md.
//
// Sudachi runs in a worker started from the files folder (`wakachi-worker.js`, put there by `wakachi copy-files`),
// shared by every analyzer on the page. kakera does the worker management, downloading in parts and the phone
// protections. Reading fixes (readings.js) are applied here, on the page, so each analyzer can have its own.
import { createPool, KakeraError } from "kakera";
import { fixReadings } from "./readings.js";
import { furiganaOf } from "./text.js";

/** Set by the build (scripts/build.mjs); the worker carries the same value. */
export const VERSION = typeof __WAKACHI_VERSION__ === "string" ? __WAKACHI_VERSION__ : "dev";

/** Errors from wakachi. `code`: see API.md §8. */
export class AnalyzerError extends KakeraError {}

const pool = createPool({ prefix: "wakachi", ErrorClass: AnalyzerError });
let versionChecked = false;

/**
 * Browsers say nothing useful when a worker's script can't be loaded ("unknown error"), so find out why.
 * The usual causes: copy-files wasn't run (404), or the site's server isn't reachable.
 */
async function explainStartFailure(workerUrl, err) {
  let res;
  try {
    res = await fetch(workerUrl, { method: "HEAD", cache: "no-store" });
  } catch {
    return new AnalyzerError("download-failed", `could not reach ${workerUrl} (is the server running, is the device online?)`, { cause: err });
  }
  if (res.status === 404) {
    return new AnalyzerError("engine-failed", `${workerUrl.replace(/\?.*/, "")} is missing: run "wakachi copy-files" into the folder served at that address`, { cause: err });
  }
  if (!res.ok) return new AnalyzerError("download-failed", `${workerUrl}: ${res.status} ${res.statusText}`, { cause: err });
  return err;
}

function checkReadings(readings) {
  if (readings == null || typeof readings !== "object" || Array.isArray(readings)) throw new TypeError("readings must be an object like { \"私\": \"わたくし\" }");
  for (const [k, v] of Object.entries(readings)) {
    if (!k || typeof v !== "string" || !/^[ぁ-ゖァ-ヺー]+$/.test(v)) throw new TypeError(`readings["${k}"] must be kana, not ${JSON.stringify(v)}`);
  }
  return { ...readings };
}

/**
 * An analyzer: a light handle with its own reading options. Sudachi is shared by all analyzers and loaded by load().
 * @param {object} [options]  see API.md §2
 */
export function createAnalyzer(options = {}) {
  const {
    filesUrl = "/wakachi/", readings = {}, everydayReadings = true,
    idleTimeout, stopWhenHidden, crashGuard, timeouts = {}, persistStorage,
  } = options;
  const own = checkReadings(readings);
  const analyzeStall = timeouts.analyzeStall ?? 20_000;
  const base = new URL(filesUrl.endsWith("/") ? filesUrl : `${filesUrl}/`, globalThis.location?.href).href;
  const workerUrl = new URL(`wakachi-worker.js?v=${encodeURIComponent(VERSION)}`, base).href;
  const definedOnly = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const handle = pool.handle(definedOnly({
    name: "sudachi",
    filesUrl: base,
    createWorker: () => new Worker(workerUrl, { type: "module" }),
    idleTimeout, stopWhenHidden, crashGuard, persistStorage,
    loadStall: timeouts.loadStall,
  }));

  async function analyzeMany(texts, { signal } = {}) {
    if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) throw new TypeError("analyzeMany() takes an array of strings");
    const results = await handle.call("analyze", { texts }, { stall: analyzeStall, signal });
    return results.map((words) => fixReadings(words, { everydayReadings, readings: own }));
  }

  async function analyze(text, o) {
    if (typeof text !== "string") throw new TypeError("analyze() takes a string");
    return (await analyzeMany([text], o))[0];
  }

  return {
    get status() { return handle.status; },

    /** Subscribe to "status", "progress" or "log". Returns an unsubscribe function. */
    on: (event, fn) => handle.on(event, fn),

    /** { cached, downloadBytes, downloadMB } without downloading anything. */
    info: () => handle.info(),

    /** Download (first time) and start Sudachi. Resolves { fromCache, ms, timings }. */
    async load() {
      let res;
      try {
        res = await handle.load();
      } catch (err) {
        throw err.code === "engine-failed" && /failed to start/.test(err.message) ? await explainStartFailure(workerUrl, err) : err;
      }
      if (!versionChecked) {
        const engine = await handle.call("version");
        if (engine !== VERSION && engine !== "dev" && VERSION !== "dev") {
          throw new AnalyzerError("engine-failed", `the files at ${base} are from wakachi ${engine}, but the page uses ${VERSION}: run "wakachi copy-files" again`);
        }
        versionChecked = true;
      }
      return res;
    },

    /** Words of `text`, with readings, dictionary forms and parts of speech. */
    analyze,

    /** Many texts in one trip to the worker; result i belongs to text i. */
    analyzeMany,

    /** Furigana for `text`: [{ text, reading? }]; joining every `text` gives back the input. */
    async furigana(text, o) {
      return furiganaOf(await analyze(text, o));
    },

    /** Free the memory now (if no other analyzer needs it). The next call reloads from the device. */
    unload() { handle.unload(); },

    /** Back to "not-loaded": pending calls reject, load() is needed again. */
    dispose() { handle.dispose(); },

    /** Delete the dictionary from this device. */
    clearCache: () => handle.clearCache(),

    /** Forget a recorded crash so load() tries again. */
    resetCrashGuard: () => handle.resetCrashGuard(),
  };
}
