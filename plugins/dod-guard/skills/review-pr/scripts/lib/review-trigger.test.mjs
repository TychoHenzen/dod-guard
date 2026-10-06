// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { REVIEW_WAIT_MS, reviewTriggerDecision } from "./review-trigger.mjs";

test("suppresses a review trigger after a completed Review Summary", () => {
  assert.deepEqual(
    reviewTriggerDecision({
      reviewSummary: { status: "completed", headSha: "reviewed-head" },
      automaticReviewStarted: false,
      waitedMs: REVIEW_WAIT_MS * 2,
      currentHeadSha: "follow-up-head",
    }),
    {
      action: "suppress",
      reason: "review-summary-complete",
      currentHeadSha: "follow-up-head",
      reviewedHeadSha: "reviewed-head",
    },
  );
});

test("holds a completed summary until both reviewed and current heads are present", () => {
  assert.deepEqual(
    reviewTriggerDecision({
      reviewSummary: { status: "completed" },
      automaticReviewStarted: false,
      waitedMs: REVIEW_WAIT_MS * 2,
      currentHeadSha: "follow-up-head",
    }),
    {
      action: "hold",
      reason: "reviewed-head-missing",
      currentHeadSha: "follow-up-head",
      reviewedHeadSha: null,
    },
  );
  assert.equal(
    reviewTriggerDecision({
      reviewSummary: { status: "completed", headSha: "reviewed-head" },
      automaticReviewStarted: false,
      waitedMs: REVIEW_WAIT_MS * 2,
    }).reason,
    "current-head-missing",
  );
});

test("allows exactly one fallback trigger after an unstarted review wait", () => {
  const beforeWait = reviewTriggerDecision({
    automaticReviewStarted: false,
    waitedMs: REVIEW_WAIT_MS - 1,
    currentHeadSha: "head-1",
  });
  const afterWait = reviewTriggerDecision({
    automaticReviewStarted: false,
    waitedMs: REVIEW_WAIT_MS,
    currentHeadSha: "head-1",
  });
  const afterTrigger = reviewTriggerDecision({
    automaticReviewStarted: false,
    waitedMs: REVIEW_WAIT_MS,
    triggerSent: true,
    currentHeadSha: "head-1",
  });

  assert.equal(beforeWait.action, "wait");
  assert.deepEqual(
    afterWait,
    {
      action: "trigger",
      command: "@codex review",
      requiredWaitMs: REVIEW_WAIT_MS,
      currentHeadSha: "head-1",
      reviewedHeadSha: null,
    },
  );
  assert.equal(afterTrigger.reason, "review-trigger-already-sent");
});

test("triggers a draft immediately because Codex never auto-reviews drafts", () => {
  assert.deepEqual(
    reviewTriggerDecision({ automaticReviewStarted: false, waitedMs: 0, currentHeadSha: "head-1", draft: true }),
    {
      action: "trigger",
      command: "@codex review",
      reason: "draft-has-no-automatic-review",
      currentHeadSha: "head-1",
      reviewedHeadSha: null,
    },
  );
  assert.equal(
    reviewTriggerDecision({ automaticReviewStarted: false, triggerSent: true, currentHeadSha: "head-1", draft: true }).reason,
    "review-trigger-already-sent",
  );
});

test("waits when review state is started or unavailable and requires an exact head", () => {
  assert.equal(reviewTriggerDecision({ automaticReviewStarted: true, currentHeadSha: "head-1" }).reason, "automatic-review-started");
  assert.equal(reviewTriggerDecision({ currentHeadSha: "head-1" }).reason, "automatic-review-state-unavailable");
  assert.equal(reviewTriggerDecision({ automaticReviewStarted: false, waitedMs: REVIEW_WAIT_MS }).reason, "current-head-missing");
});
