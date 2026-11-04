import assert from "node:assert/strict";
import test from "node:test";

import { renderComment } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-report.mjs";
import { finding } from "./pr-gate-test-support.mjs";

const quota = {
  satisfied: true,
  available: { top: 30, low: 0 },
  fixed: { top: 30, low: 0 },
  required: { top: 1, low: 0 },
  targets: { top: 1, low: 3 },
};

test("the comment lists at most 25 removed findings and counts the rest", () => {
  const resolved = Array.from({ length: 30 }, (_, i) =>
    finding({ file: `f${String(i).padStart(2, "0")}.js` }),
  );
  const gate = { blocking: [], quota, passed: true };
  const classified = {
    fresh: [],
    existing: [],
    moved: [],
    resolved,
    worsened: [],
  };
  const text = renderComment({ gate, classified });
  assert.match(text, /Pre-existing findings removed by this pull request \(30\)/);
  assert.match(text, /and 5 more/);
  assert.equal(text.split("\n").filter((line) => line.startsWith("- `f")).length, 25);
});
