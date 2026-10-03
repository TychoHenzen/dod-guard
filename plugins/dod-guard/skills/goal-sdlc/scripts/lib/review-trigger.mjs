const REVIEW_WAIT_MS = 120_000;

function completedReviewSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return false;
  }
  if (summary.completed === true) {
    return true;
  }
  const status = summary.status ?? summary.state;
  return typeof status === "string" && ["complete", "completed", "success"].includes(status.toLowerCase());
}

function reviewedHead(summary) {
  return summary?.headSha ?? summary?.head_sha ?? null;
}

function hasHead(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function reviewTriggerDecision({
  reviewSummary = null,
  automaticReviewStarted,
  waitedMs = 0,
  triggerSent = false,
  currentHeadSha = null,
} = {}) {
  const evidence = {
    currentHeadSha,
    reviewedHeadSha: reviewedHead(reviewSummary),
  };

  if (!hasHead(currentHeadSha)) {
    return { ...evidence, action: "hold", reason: "current-head-missing" };
  }
  if (completedReviewSummary(reviewSummary)) {
    if (!hasHead(evidence.reviewedHeadSha)) {
      return { ...evidence, action: "hold", reason: "reviewed-head-missing" };
    }
    return { ...evidence, action: "suppress", reason: "review-summary-complete" };
  }
  if (triggerSent) {
    return { ...evidence, action: "suppress", reason: "review-trigger-already-sent" };
  }
  if (automaticReviewStarted === true) {
    return { ...evidence, action: "wait", reason: "automatic-review-started" };
  }
  if (automaticReviewStarted !== false) {
    return { ...evidence, action: "wait", reason: "automatic-review-state-unavailable" };
  }
  if (!Number.isFinite(waitedMs) || waitedMs < REVIEW_WAIT_MS) {
    return { ...evidence, action: "wait", reason: "review-wait-incomplete", requiredWaitMs: REVIEW_WAIT_MS };
  }
  return { ...evidence, action: "trigger", command: "@codex review", requiredWaitMs: REVIEW_WAIT_MS };
}

export { REVIEW_WAIT_MS, reviewTriggerDecision };
