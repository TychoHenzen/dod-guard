/**
 * Default test-file globs when no `openspec/test-globs.json` entry exists for
 * a group. Covers common test-file naming conventions across all languages
 * the marker scanner supports (see languages.ts). Project-wide: `**` starts
 * from the repo root. `resolveGlob`'s `walkDoubleStar` skips `node_modules`,
 * `.git`, and other non-source directories.
 */

const DEFAULT_TEST_GLOBS: string[] = [
  "**/*.test.ts",
  "**/*.test.js",
  "**/*.test.mjs",
  "**/*.test.cjs",
  "**/*.spec.ts",
  "**/*.spec.js",
  "**/test_*.py",
  "**/*_test.py",
  "**/*_test.go",
  "**/*_test.rb",
  "**/*_spec.rb",
  "**/*Test.java",
  "**/*Test.kt",
  "**/test_*.sh",
  "**/test_*.bash",
];

export function testGlobsForGroup(_group: string): string[] {
  return DEFAULT_TEST_GLOBS;
}
