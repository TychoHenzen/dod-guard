import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/bundle.js",
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);`,
  },
  external: ["better-sqlite3"],
  minify: false,
  sourcemap: false,
});
