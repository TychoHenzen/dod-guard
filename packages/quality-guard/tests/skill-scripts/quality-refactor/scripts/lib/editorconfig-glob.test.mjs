// EditorConfig section matching for numeric ranges.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { matchesSection } from "../../../../../skills/quality-refactor/scripts/lib/editorconfig-glob.mjs";

const GLOB_MODULE = new URL(
  "../../../../../skills/quality-refactor/scripts/lib/editorconfig-glob.mjs",
  import.meta.url,
).href;

// Past Number.MAX_SAFE_INTEGER, n + 1 rounds back to n, so enumerating the
// range only stops when the array runs out of memory. The child gets a small
// heap so that enumeration crashes at once, and a timeout in case it does not.
function matchInChild(pattern, path) {
  const script =
    `const { matchesSection } = await import(${JSON.stringify(GLOB_MODULE)});` +
    `console.log(matchesSection(${JSON.stringify(pattern)}, ${JSON.stringify(path)}));`;
  const args = ["--max-old-space-size=32", "--input-type=module", "-e", script];
  return spawnSync(process.execPath, args, { encoding: "utf8", timeout: 5000 });
}

test("a range with an unsafe integer endpoint finishes and never matches", () => {
  const result = matchInChild(
    "{9007199254740992..9007199254740992}",
    "9007199254740992",
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "false");
});

test("a small numeric range still matches its members", () => {
  assert.equal(matchesSection("{1..3}", "2"), true);
  assert.equal(matchesSection("{1..3}", "4"), false);
});
