import assert from "node:assert/strict";
import test from "node:test";

import { renderComment, renderReport } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-report.mjs";
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

const emptyClassified = { fresh: [], existing: [], moved: [], resolved: [], worsened: [] };

test("the report lists changed files skipped by an exclusion", () => {
  const gate = { blocking: [], quota, passed: true };
  const report = renderReport({
    gate,
    classified: emptyClassified,
    mergeBase: "abc123",
    changedCount: 1,
    skipped: ["samples/v.js"],
    settingChanged: true,
  });
  assert.match(report, /## Changed files skipped by an exclusion \(1\)/);
  assert.match(report, /- `samples\/v\.js`/);
  assert.match(report, /This pull request changes \.quality-guard\.json\./);
});

test("the comment counts skipped files and notes a changed setting", () => {
  const gate = { blocking: [], quota, passed: true };
  const comment = renderComment({
    gate,
    classified: emptyClassified,
    link: "https://example.test/log",
    skipped: ["samples/v.js", "samples/w.js"],
    settingChanged: true,
  });
  assert.match(comment, /- Changed files skipped by an exclusion: 2 \(listed in \[full log\]\(https:\/\/example\.test\/log\)\)/);
  assert.match(comment, /- This pull request changes \.quality-guard\.json; the merge-base setting applied\./);
});

test("the verdict and counts are unchanged by skipped files", () => {
  const gate = { blocking: [finding()], quota, passed: false };
  const classified = { ...emptyClassified, fresh: [finding({ severity: "low" })] };
  const base = { gate, classified, mergeBase: "abc123", changedCount: 1 };
  const withSkipped = renderReport({ ...base, skipped: ["samples/v.js"] });
  const withoutSkipped = renderReport(base);
  const resultLine = (text) => text.split("\n").find((line) => line.startsWith("**Result:"));
  const blockingLine = (text) => text.split("\n").find((line) => line.startsWith("## New findings that block"));
  assert.equal(resultLine(withSkipped), resultLine(withoutSkipped));
  assert.equal(blockingLine(withSkipped), blockingLine(withoutSkipped));
  assert.match(withSkipped, /## Changed files skipped by an exclusion \(1\)/);
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
