// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { dispatchReviewers, incompleteEntries } from "./review-dispatch.mjs";

const WRAPPER_REJECTED = /rejects shell wrapper/;
const DUPLICATE_PAIR = /same reviewer twice for one unit/;
const MISSING_UNIT = /requires a review unit/;

const entry = (reviewer, unit) => ({ reviewer, unit, prompt: `${reviewer} on ${unit}` });

test("runs the same angle on two units but rejects a repeated reviewer-unit pair", async () => {
  // Entry validation runs before the wrapper check, so reaching the wrapper error means the entries were accepted.
  await assert.rejects(
    dispatchReviewers({
      reviewers: [entry("review-pr-hygiene", "src"), entry("review-pr-hygiene", "docs")],
      executable: "powershell.exe",
      platform: "win32",
    }),
    WRAPPER_REJECTED,
  );
  await assert.rejects(
    dispatchReviewers({ reviewers: [entry("review-pr-hygiene", "src"), entry("review-pr-hygiene", "src")] }),
    DUPLICATE_PAIR,
  );
  await assert.rejects(dispatchReviewers({ reviewers: [{ reviewer: "review-pr-hygiene", prompt: "x" }] }), MISSING_UNIT);
});

test("retries only the reviewer-unit pairs that did not complete", () => {
  const reviewers = [entry("review-pr-hygiene", "src"), entry("review-pr-hygiene", "docs"), entry("review-pr-feature", "pull-request")];
  const previous = {
    reviews: [
      { reviewer: "review-pr-hygiene", unit: "src", execution: { status: "completed" } },
      { reviewer: "review-pr-hygiene", unit: "docs", execution: { status: "incomplete" } },
    ],
  };

  assert.deepEqual(incompleteEntries(reviewers, previous), [entry("review-pr-hygiene", "docs"), entry("review-pr-feature", "pull-request")]);
});
