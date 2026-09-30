import { JSDOM } from "jsdom";
import { build } from "esbuild";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5174",
});
for (const key of [
  "window",
  "document",
  "localStorage",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "Node",
  "MutationObserver",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
await build({
  entryPoints: ["tests/ui.jsx"],
  outfile: "tests/.ui-bundle.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  define: { "import.meta.env.VITE_API_URL": '"/api"' },
  logLevel: "warning",
});
await import("./.ui-bundle.mjs");
