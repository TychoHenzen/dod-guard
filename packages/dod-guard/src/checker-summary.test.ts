// cli.ts prints only the first line of a check summary under its quiet flag.
// These cases hold that line to one line, and to naming the verdict.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSummary } from "./checker-summary.js";

test("the summary is a single line", () => {
  const line = buildSummary("pass", { pass: 2, total: 2, draft: 0 });
  assert.equal(line.includes("\n"), false);
});

test("the summary names the verdict in upper case", () => {
  assert.match(buildSummary("pass_dirty", { pass: 1, total: 1, draft: 0 }), /PASS_DIRTY/);
  assert.match(buildSummary("stuck", { pass: 0, total: 1, draft: 0 }), /STUCK/);
});

test("the summary reports how many proofs passed out of the total", () => {
  assert.match(buildSummary("fail", { pass: 1, total: 3, draft: 0 }), /1\/3/);
});

test("a draft count appears only when drafts remain", () => {
  assert.match(buildSummary("incomplete", { pass: 1, total: 1, draft: 2 }), /2 draft/);
  assert.doesNotMatch(buildSummary("pass", { pass: 1, total: 1, draft: 0 }), /draft/);
});
