import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const output = new URL("../dist/browser/", import.meta.url);
const source = new URL("../src/browser/", import.meta.url);

await mkdir(output, { recursive: true });
await Promise.all(["index.html", "style.css"].map((asset) => cp(new URL(asset, source), new URL(asset, output))));
await build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("client.ts", source))],
  format: "esm",
  outfile: fileURLToPath(new URL("client.js", output)),
  platform: "browser",
  target: "es2022",
});
