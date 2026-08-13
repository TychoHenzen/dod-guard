/**
 * A spec group maps 1:1 to the package or tool directory that implements it,
 * per root CLAUDE.md's "Monorepo overview": five groups match a package name
 * under `packages/`, the sixth (`openspec-dashboard`) names the tool under
 * `tools/openspec-dashboard`. `cover` uses this to find a group's test files
 * and, later, its `dist/**\/*.js` for coverage instrumentation.
 */
function packageDirForGroup(group: string): string {
  if (group === "openspec-dashboard") return "tools/openspec-dashboard";
  return `packages/${group}`;
}

/** Glob patterns for where a group's test files live, relative to the repo
 * root. Packages keep TypeScript sources under `src/`; `tools/
 * openspec-dashboard` has no such convention and runs plain JS, so it's
 * searched flat for both extensions. `resolveGlob` has no brace-expansion, so
 * this returns one pattern per extension instead of one braced pattern. */
export function testGlobsForGroup(group: string): string[] {
  const pkgDir = packageDirForGroup(group);
  if (pkgDir.startsWith("packages/")) return [`${pkgDir}/src/**/*.test.ts`];
  return [`${pkgDir}/**/*.test.js`, `${pkgDir}/**/*.test.mjs`];
}
