import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

// Same shape as rustFile and tsFile, with lang "py" (no Python builder exists).
const pyFile = (rel, code) => ({ ...tsFile(rel, code), lang: "py" });
const summary = (file) =>
  scanViolations(file)
    .filter((v) => v.rule === "else-branch")
    .map((v) => [v.message.split("(")[0], v.metric]);

// An empty result only means something if the named functions were parsed.
function assertQuiet(file, names) {
  assert.deepEqual(summary(file), []);
  const parsed = scanFile(file, buildConfig()).functions.map((fn) => fn.name);
  const missing = names.filter((n) => !parsed.includes(n));
  assert.deepEqual(missing, []);
}

test("a Black-style multi-line if/else counts its branch", () => {
  const code = `def black_if(a, b):
    if (
        a
        and b
    ):
        return 1
    else: return 2`;
  assert.deepEqual(summary(pyFile("b.py", code)), [["black_if", 1]]);
});

test("a conditional split inside brackets counts its else", () => {
  const code = `def split(a, c, b):
    return (
        a if c
        else b
    )`;
  assert.deepEqual(summary(pyFile("s.py", code)), [["split", 1]]);
});

test("a Black-style for header keeps its for-level else quiet", () => {
  const code = `def black_for(xs):
    for x in (
        xs
    ):
        pass
    else: return None`;
  assertQuiet(pyFile("f.py", code), ["black_for"]);
});
