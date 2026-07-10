import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/bundle.js",
  banner: { js: "#!/usr/bin/env node" },
  external: [],
  minify: false,
  sourcemap: false,
});
