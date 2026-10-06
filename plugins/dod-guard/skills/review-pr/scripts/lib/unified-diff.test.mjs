// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { parseChangedLines, sideLinePath } from "./unified-diff.mjs";

// Captured from `git diff --unified=0` with Git's default core.quotePath=true.
const SPECIAL_PATH_DIFF = [
  'diff --git "a/docs x/p & \\303\\274.md" "b/docs x/p & \\303\\274.md"',
  "index 7898192..6178079 100644",
  '--- "a/docs x/p & \\303\\274.md"\t',
  '+++ "b/docs x/p & \\303\\274.md"\t',
  "@@ -1 +1 @@",
  "-a",
  "+b",
  "diff --git a/gone.md b/gone.md",
  "deleted file mode 100644",
  "--- a/gone.md",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-a",
  "diff --git a/sp ace.md b/sp ace.md",
  "--- a/sp ace.md\t",
  "+++ b/sp ace.md\t",
  "@@ -2,0 +3 @@",
  "+c",
  "diff --git a/img x.png b/img x.png",
  "Binary files a/img x.png and b/img x.png differ",
  "diff --git a/longname.md b/x.md",
  "similarity index 100%",
  "rename from longname.md",
  "rename to x.md",
  'diff --git "a/\\303\\274 old.md" "b/\\303\\274 new.md"',
  "similarity index 100%",
  'rename from "\\303\\274 old.md"',
  'rename to "\\303\\274 new.md"',
].join("\n");

test("decodes Git's quoted and TAB-terminated diff paths", () => {
  assert.equal(sideLinePath('+++ "b/docs x/p & \\303\\274.md"\t'), "docs x/p & ü.md");
  assert.equal(sideLinePath('+++ "b/quote\\"d\\\\back.md"'), 'quote"d\\back.md');
  assert.equal(sideLinePath("+++ b/sp ace.md\t"), "sp ace.md");
  assert.equal(sideLinePath("+++ /dev/null"), null);
});

test("records final-state lines for special-character paths", () => {
  const changed = parseChangedLines(SPECIAL_PATH_DIFF);

  assert.deepEqual([...changed.get("docs x/p & ü.md")], [1]);
  assert.deepEqual([...changed.get("sp ace.md")], [3]);
  assert.equal(changed.has("gone.md"), false);
});
