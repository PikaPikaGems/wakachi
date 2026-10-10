// The React test page's app (test/react.html). Built by `npm run build:test-react` into test/react-app.js, with
// React bundled in. It uses dist/react.js exactly as an app would.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useWakachi, useWakachiEngine, type WakachiState, type WakachiEngine } from "../dist/react.js";
import { furiganaOf } from "../dist/text.js";

const FILES = new URL("./files/", location.href).href;
type Hooks = { history: WakachiState[]; a?: WakachiState; b?: WakachiState; engine?: WakachiEngine; setText?: (t: string) => void };
const w = window as unknown as { hooks: Hooks };
w.hooks = { history: [] };

function Reader({ name, text, readings }: { name: "a" | "b"; text: string; readings?: Record<string, string> }) {
  const r = useWakachi(text, { filesUrl: FILES, readings });
  useEffect(() => { w.hooks[name] = r; if (name === "a") w.hooks.history.push(r); });
  let body;
  switch (r.status) {
    case "not-loaded": body = <button onClick={r.load}>{r.cached ? "Turn on furigana" : `Download dictionary (${r.downloadMB ?? "…"} MB)`}</button>; break;
    case "loading": body = <progress value={r.progress.fraction} />; break;
    case "unavailable": body = <span>{text} ({r.reason})</span>; break;
    case "error": body = <span>{r.error.message} <button onClick={r.retry}>Retry</button></span>; break;
    case "done": body = <span style={{ opacity: r.stale ? 0.5 : 1 }}>{furiganaOf(r.words).map((s, i) =>
      s.reading ? <ruby key={i}>{s.text}<rt>{s.reading}</rt></ruby> : s.text)}</span>;
  }
  return <p><b>{name}</b> <small>[{r.status}]</small> {body}</p>;
}

function EngineRow() {
  const e = useWakachiEngine({ filesUrl: FILES });
  useEffect(() => { w.hooks.engine = e; });
  return <div className="row">
    Dictionary: {e.cached == null ? "…" : e.cached ? "on this device" : `${e.downloadMB} MB to download`}, <b>{e.status}</b>
    {e.progress && <progress value={e.progress.fraction} />}
    {e.status === "not-loaded" && <button onClick={e.load}>{e.cached ? "Load" : "Download"}</button>}
    {e.status === "ready" && <button onClick={e.unload}>Free memory</button>}
    {e.cached && <button onClick={e.clearCache}>Delete from device</button>}
    {e.error && <span> {e.error.message}</span>}
  </div>;
}

function App() {
  const [text, setText] = useState("私は明日、東京へ行きます。");
  w.hooks.setText = setText;
  return <>
    <EngineRow />
    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} cols={50} />
    <Reader name="a" text={text} />
    <Reader name="b" text={text} readings={{ "私": "わたくし" }} />
  </>;
}

createRoot(document.getElementById("app")!).render(<App />);
