// line-length through a real scan of a C# file governed by .editorconfig.
// The 130-char line is only there to surface a finding, so that its
// widthSource can be read; the 100-char line is the one under test.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lineFindings,
  lineOf,
  tempTree,
  writeTree,
} from "./formatter-width-test-support.mjs";

const SOURCE = `${lineOf(100)}\n${lineOf(130)}\n`;

test("a 100-char .cs line under .editorconfig 120 gives no finding; the width source is .editorconfig", (t) => {
  const root = tempTree(t, {
    ".editorconfig": "[*.cs]\nmax_line_length = 120\n",
    "src/a.cs": SOURCE,
  });
  assert.deepEqual(lineFindings(root), [
    {
      file: "src/a.cs",
      length: 130,
      severity: "high",
      message: "line is 130 chars (width 120)",
      widthSource: ".editorconfig",
    },
  ]);
});

test("without the .editorconfig the same 100-char line is medium", (t) => {
  const root = tempTree(t, { "src/a.cs": SOURCE });
  const hundred = lineFindings(root).find((f) => f.length === 100);
  assert.deepEqual(
    [hundred.severity, hundred.message, hundred.widthSource],
    ["medium", "line is 100 chars (width 80)", "default"],
  );
});

test("after a bad value is replaced with a valid one, the configured width applies", (t) => {
  const root = tempTree(t, {
    ".editorconfig": "[*.cs]\nmax_line_length = off\n",
    "src/a.cs": SOURCE,
  });
  const before = lineFindings(root).find((f) => f.length === 100);
  assert.equal(before.severity, "medium");
  writeTree(root, { ".editorconfig": "[*.cs]\nmax_line_length = 120\n" });
  assert.equal(
    lineFindings(root).some((f) => f.length === 100),
    false,
  );
});
