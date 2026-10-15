import assert from "node:assert/strict";
import test from "node:test";

import { renderComment } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-report.mjs";
import { finding } from "./pr-gate-test-support.mjs";

const quota = {
  satisfied: true,
  available: { top: 2, low: 0 },
  fixed: { top: 1, low: 0 },
  required: { top: 1, low: 0 },
  targets: { top: 1, low: 3 },
};

test("the open-debt count includes findings that moved between files", () => {
  const gate = { blocking: [], quota, passed: true };
  const classified = {
    fresh: [],
    existing: [finding()],
    moved: [finding({ file: "b.cs" })],
    resolved: [],
    worsened: [],
  };
  assert.match(
    renderComment({ gate, classified }),
    /still open in the changed files: 2\./,
  );
});

test("the comment starts with the marker the updater looks for", () => {
  const gate = { blocking: [], quota, passed: true };
  const classified = {
    fresh: [],
    existing: [],
    moved: [],
    resolved: [],
    worsened: [],
  };
  assert.ok(
    renderComment({ gate, classified }).startsWith("<!-- quality-pr-gate -->"),
  );
});
