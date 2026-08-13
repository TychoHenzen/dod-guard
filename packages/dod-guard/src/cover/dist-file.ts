/**
 * The file a marker names is always a source file - `scanMarkers` reads
 * `packages/*\/src/**\/*.test.ts` directly, never a compiled one. Running it
 * needs the compiled file `node --test` actually loads. A package compiles
 * `src/` to `dist/` with `tsc`, `.ts` to `.js`; `tools/openspec-dashboard` has
 * no such step, so its own `.js`/`.mjs` files run as they are.
 */
import * as path from "node:path";

export function distTestFile(cwd: string, pkgDir: string, srcTestFile: string): string {
  if (!pkgDir.startsWith("packages/")) return srcTestFile;

  const srcRoot = path.join(cwd, pkgDir, "src");
  const rel = path.relative(srcRoot, srcTestFile);
  const distRoot = path.join(cwd, pkgDir, "dist");
  return path.join(distRoot, rel.replace(/\.ts$/, ".js"));
}
