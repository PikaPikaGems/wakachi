// For the Node tests: the Sudachi build (program + dictionary in one wasm), as `npm run files` caches it.
import fs from "node:fs";
import { SUDACHI_BUILD } from "../scripts/sudachi-build.mjs";

export const WASM = new URL(`../.cache/${SUDACHI_BUILD}/sudachi.wasm`, import.meta.url);

/** A fresh instance (the glue keeps its wasm instance in module state, so each `name` gets its own copy). */
export async function sudachi(name) {
  if (!fs.existsSync(WASM)) throw new Error(`${WASM.pathname} is missing: run "npm run files" first`);
  const glue = await import(`../src/sudachi-glue.js?${name}`);
  const { memory } = await glue.default({ module_or_path: fs.readFileSync(WASM) });
  return { glue, memory };
}
