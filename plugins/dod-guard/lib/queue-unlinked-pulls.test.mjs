import assert from "node:assert/strict";
import test from "node:test";
import { unlinkedPullRequestsOf, unlinkedReason } from "./queue-unlinked-pulls.mjs";

test("an absent key gives an empty list", () => {
  assert.deepEqual(unlinkedPullRequestsOf({}), []);
});

test("a non-array key gives an empty list", () => {
  assert.deepEqual(unlinkedPullRequestsOf({ unlinkedPullRequests: "x" }), []);
});

test("an entry without a positive integer number is dropped", () => {
  const entries = [{ number: 0 }, { number: "7" }, null, { number: 8, headRef: "a" }];
  assert.deepEqual(unlinkedPullRequestsOf({ unlinkedPullRequests: entries }), [{ number: 8, headRef: "a" }]);
});

test("a non-string headRef becomes null", () => {
  assert.deepEqual(unlinkedPullRequestsOf({ unlinkedPullRequests: [{ number: 9, headRef: 4 }] }), [
    { number: 9, headRef: null },
  ]);
});

test("the reason names the pull request and its head", () => {
  assert.equal(
    unlinkedReason({ number: 31, headRef: "dependabot/npm/x" }),
    "open pull request #31 (head dependabot/npm/x) is linked to no Project issue",
  );
});

test("the reason omits a missing head", () => {
  assert.equal(unlinkedReason({ number: 31, headRef: null }), "open pull request #31 is linked to no Project issue");
});
