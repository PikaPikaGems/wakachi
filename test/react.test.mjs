// useWakachi()'s state (src/react-state.ts) with a fake engine: no React or Sudachi needed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { engineStore } from "kakera/store";
import { createReader } from "../.cache/compiled/react-state.js";

const word = (surface, reading, start) => ({
  surface, reading, dictionaryForm: surface, normalizedForm: surface, pos: "名詞", tags: [],
  posDetail: ["名詞", "普通名詞", "一般", "*", "*", "*"], start, end: start + surface.length,
});

/** A fake shared analyzer: status events, and analyze() calls that the test answers by hand. */
function fakeEngine() {
  const listeners = { status: new Set(), progress: new Set() };
  const e = {
    status: "not-loaded", loads: 0, calls: [],
    emit(event, value) { if (event === "status") e.status = value; for (const fn of listeners[event]) fn(value); },
    on(event, fn) { listeners[event].add(fn); return () => listeners[event].delete(fn); },
    async info() { return { cached: false, downloadMB: 45 }; },
    async load() { e.loads++; e.emit("status", "loading"); await null; e.emit("status", "ready"); },
    unload() { e.emit("status", "stopped"); },
    async clearCache() {},
    async debugReport() { return ""; },
    analyze(text, { signal } = {}) {
      return new Promise((resolve, reject) => {
        const call = { text, signal, resolve, reject };
        e.calls.push(call);
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    },
    /** Answers the latest call for `text` with one word per character. */
    answer(text) {
      const call = e.calls.findLast((c) => c.text === text);
      call.resolve([...text].map((ch, i) => word(ch, ch === "私" ? "ワタクシ" : "", i)));
    },
  };
  return e;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const engine = fakeEngine();
  const store = engineStore(engine);
  const reader = createReader(store, engine);
  reader.start();
  return { engine, store, reader, state: () => reader.getSnapshot() };
}

test("nothing loads on mount: not-loaded offers load(), cached and downloadMB", async () => {
  const { engine, reader, state } = setup();
  reader.setText("猫");
  assert.equal(state().status, "not-loaded");
  assert.equal(state().cached, null);
  await tick();
  assert.equal(state().cached, false);
  assert.equal(state().downloadMB, 45);
  assert.equal(engine.loads, 0);
  assert.equal(engine.calls.length, 0);
});

test("load() anywhere starts analysis; done has words, bunsetsu, furigana", async () => {
  const { engine, store, reader, state } = setup();
  reader.setText("私");
  await store.load(); // e.g. from useWakachiEngine() in another component
  assert.equal(state().status, "loading");
  assert.equal(engine.calls.length, 1);
  engine.answer("私");
  await tick();
  const s = state();
  assert.equal(s.status, "done");
  assert.equal(s.stale, false);
  assert.equal(s.words[0].reading, "ワタシ"); // the everyday reading fix is applied by the hook
  assert.equal(s.bunsetsu.length, 1);
  assert.deepEqual(s.furigana, [{ text: "私", reading: "わたし" }]);
  assert.equal(state(), s); // same snapshot until something changes
});

test("a new text keeps the previous result (stale) and drops outdated answers", async () => {
  const { engine, store, reader, state } = setup();
  reader.setText("猫");
  await store.load();
  engine.answer("猫");
  await tick();
  reader.setText("犬");
  reader.setText("鳥");
  assert.equal(state().status, "done");
  assert.equal(state().stale, true);
  assert.equal(state().words[0].surface, "猫");
  assert.ok(engine.calls.find((c) => c.text === "犬").signal.aborted);
  engine.answer("鳥");
  await tick();
  assert.equal(state().stale, false);
  assert.equal(state().words[0].surface, "鳥");
});

test("own readings: changing them re-analyzes; bad readings throw", async () => {
  const { engine, store, reader, state } = setup();
  reader.setOptions({ readings: { 私: "わたくし" } });
  reader.setText("私");
  await store.load();
  engine.answer("私");
  await tick();
  assert.equal(state().words[0].reading, "ワタクシ");
  reader.setOptions({ readings: { 私: "わたくし" } }); // same options in a new object: nothing to do
  assert.equal(engine.calls.length, 1);
  reader.setOptions({ everydayReadings: false });
  assert.equal(state().stale, true);
  engine.answer("私");
  await tick();
  assert.equal(state().words[0].reading, "ワタクシ"); // Sudachi's own reading in the fake
  assert.throws(() => reader.setOptions({ readings: { 私: "watashi" } }), TypeError);
});

test("an analysis error shows error with retry(); stop() drops the pending call", async () => {
  const { engine, store, reader, state } = setup();
  reader.setText("猫");
  await store.load();
  engine.calls[0].reject(Object.assign(new Error("worker crashed"), { code: "worker-crashed" }));
  await tick();
  assert.equal(state().status, "error");
  assert.equal(state().error.code, "worker-crashed");
  state().retry();
  assert.equal(engine.calls.length, 2);
  reader.stop();
  assert.ok(engine.calls[1].signal.aborted);
});

test("unavailable and load errors come from the shared engine", async () => {
  const { engine, store, state } = setup();
  engine.load = async () => { engine.emit("status", "error"); throw Object.assign(new Error("offline"), { code: "download-failed" }); };
  await store.load();
  assert.equal(state().status, "error");
  assert.equal(state().error.code, "download-failed");
  engine.emit("status", "unavailable");
  assert.equal(state().status, "unavailable");
  assert.equal(typeof state().reason, "string");
});
