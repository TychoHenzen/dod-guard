/**
 * Shared esbuild driver for every package bundle.
 *
 * The five packages differ only in which native modules stay external and
 * whether the output needs a shebang or a CommonJS `require` shim. Keeping
 * one driver here means a change to the bundle contract lands once. It also
 * keeps the per-package config below the duplicate-block bar.
 */

import { build } from "esbuild";

const REQUIRE_SHIM =
  'import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);';

function bannerFor({ shebang, requireShim }) {
  const parts = [];
  if (shebang) parts.push("#!/usr/bin/env node");
  if (requireShim) parts.push(REQUIRE_SHIM);
  return parts.length > 0 ? { js: parts.join("\n") } : undefined;
}

/**
 * Bundle `src/index.ts` to `dist/bundle.js` for the calling package.
 * Run it from that package directory, which is what `npm run bundle` does.
 */
export function bundlePackage({ external = [], shebang = true, requireShim = false } = {}) {
  return build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: "dist/bundle.js",
    banner: bannerFor({ shebang, requireShim }),
    external,
    minify: false,
    sourcemap: false,
  });
}
