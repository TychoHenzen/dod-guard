/**
 * Shared esbuild driver for every package bundle.
 *
 * Workspace packages differ only in which native modules stay external and
 * whether the output needs a shebang or a CommonJS `require` shim. Keeping
 * one driver here means a change to the bundle contract lands once. It also
 * keeps the per-package config below the duplicate-block bar. esbuild's charset
 * option leaves non-ASCII in comments raw, so the driver escapes comments itself
 * and fails the build on a raw character anywhere else.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { build } from "esbuild";
import { toAsciiBundle } from "./ascii-output.mjs";

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
export async function bundlePackage({
  external = [],
  shebang = true,
  requireShim = false,
  entryPoint = "src/index.ts",
  outfile = "dist/bundle.js",
} = {}) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile,
    banner: bannerFor({ shebang, requireShim }),
    external,
    minify: false,
    sourcemap: false,
    charset: "ascii",
    write: false,
  });
  await Promise.all(
    result.outputFiles.map(async (file) => {
      const text = toAsciiBundle({ text: file.text, file: file.path });
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(file.path, text);
    }),
  );
}
