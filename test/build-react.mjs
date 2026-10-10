// Builds test/react-app.js (React bundled in) for test/react.html. Run `npm run build` first.
import { build } from "esbuild";
await build({
  entryPoints: [new URL("react-app.tsx", import.meta.url).pathname], outfile: new URL("react-app.js", import.meta.url).pathname,
  bundle: true, format: "esm", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "warning",
});
