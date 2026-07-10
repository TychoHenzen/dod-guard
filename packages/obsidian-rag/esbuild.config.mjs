import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/bundle.js",
  format: "esm",
  banner: {
    js: `import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);`,
  },
  external: ["better-sqlite3"],
});
