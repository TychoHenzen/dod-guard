import { REVIEW_WAIT_MS, reviewTriggerDecision } from "./review-trigger.mjs";

const CODEX_BOT = "chatgpt-codex-connector[bot]";
const SUMMARY_MARKER = "<!-- codex-pull-request-review-summary -->";
const CODE_REVIEW_ROW = /\*\*Code Review\*\*\s*\|([^|]*)\|\s*`([0-9a-f]{7,40})`\s*\|([^|]*)\|/i;
const SEVERITY_BADGE = /!\[(P\d) Badge\]/;
const FINDING_TITLE = /<\/sub><\/sub>\s*(.+?)\*\*/;
const REVIEW_TRIGGER = /^@codex review\b/i;
const COMPLETED_CELL = /\*\*Completed\*\*/i;
const FAILED_CELL = /\*\*Failed\*\*/i;
const CELL_TIME = /datetime="([^"]+)"/;
const TRIGGER_ACKNOWLEDGE_MS = 600_000;

function byCodex(item) {
  return item?.user?.login === CODEX_BOT;
}

function rowStatus(cell) {
  if (COMPLETED_CELL.test(cell)) {
    return "completed";
  }
  if (FAILED_CELL.test(cell)) {
    return "failed";
  }
  return "pending";
}

function codeReviewRow(summaryBody) {
  const match = summaryBody.match(CODE_REVIEW_ROW);
  if (!match) {
    return null;
  }
  return {
    status: rowStatus(match[1]),
    commit: match[2],
    trigger: match[3].trim(),
    updatedAt: match[1].match(CELL_TIME)?.[1],
  };
}

function latestSummary(issueComments) {
  return issueComments.filter((comment) => byCodex(comment) && comment.body?.includes(SUMMARY_MARKER)).at(-1) ?? null;
}

function findingTitle(body) {
  const title = body.match(FINDING_TITLE)?.[1];
  if (title) {
    return title.trim();
  }
  return body.split("\n")[0].trim();
}

function finding(comment) {
  const body = comment.body ?? "";
  return {
    id: `GH-${comment.id}`,
    commentId: comment.id,
    severity: body.match(SEVERITY_BADGE)?.[1] ?? "unrated",
    title: findingTitle(body),
    file: comment.path,
    line: comment.line ?? comment.original_line,
    outdated: !Number.isInteger(comment.line),
    url: comment.html_url,
  };
}

// Codex posts its findings as one COMMENTED review pinned to the commit it read.
function findingsFor(commitPrefix, reviews, reviewComments) {
  const reviewIds = new Set(
    reviews.filter((review) => byCodex(review) && review.commit_id?.startsWith(commitPrefix)).map((review) => review.id),
  );
  return reviewComments
    .filter((comment) => byCodex(comment) && !comment.in_reply_to_id && reviewIds.has(comment.pull_request_review_id))
    .map(finding);
}

function recommendation(findings) {
  if (findings.some((item) => item.severity === "P0")) {
    return "BLOCK";
  }
  if (findings.length > 0) {
    return "REQUEST_CHANGES";
  }
  return "APPROVE";
}

function completedReport(base, input) {
  const { commit } = base.codeReview;
  const findings = findingsFor(commit, input.reviews, input.reviewComments);
  return {
    ...base,
    action: "report",
    reason: "code-review-completed",
    reviewedCommit: commit,
    reviewedCurrentHead: Boolean(base.headSha?.startsWith(commit)),
    findings,
    recommendation: recommendation(findings),
  };
}

function reviewRunning(codeReview, reactions) {
  return codeReview?.status === "pending" || reactions.some((reaction) => byCodex(reaction) && reaction.content === "eyes");
}

// The one allowed trigger already produced this failure, so another trigger would be a second one.
function failedAfter(codeReview, trigger) {
  if (codeReview?.status !== "failed" || !trigger) {
    return false;
  }
  return Date.parse(codeReview.updatedAt) >= Date.parse(trigger.created_at);
}

function pendingDecision(base, input) {
  const trigger = input.issueComments.filter((comment) => REVIEW_TRIGGER.test(comment.body?.trim() ?? "")).at(-1);
  const running = reviewRunning(base.codeReview, input.reactions);
  if (failedAfter(base.codeReview, trigger)) {
    return { ...base, action: "hold", reason: "code-review-failed", triggerUrl: trigger.html_url };
  }
  if (trigger && !running && input.now - Date.parse(trigger.created_at) >= TRIGGER_ACKNOWLEDGE_MS) {
    return { ...base, action: "hold", reason: "review-trigger-not-acknowledged", triggerUrl: trigger.html_url };
  }
  let { waitedMs } = input;
  // A failed review never restarts on its own, so the wait for one is already over.
  if (base.codeReview?.status === "failed") {
    waitedMs = REVIEW_WAIT_MS;
  }
  const decision = reviewTriggerDecision({
    automaticReviewStarted: running,
    waitedMs,
    triggerSent: Boolean(trigger),
    currentHeadSha: base.headSha,
    draft: base.draft,
  });
  if (decision.action === "suppress") {
    return { ...base, action: "wait", reason: decision.reason };
  }
  return { ...base, ...decision };
}

function codexReviewState(rawInput) {
  const input = {
    pullRequest: {},
    issueComments: [],
    reviews: [],
    reviewComments: [],
    reactions: [],
    waitedMs: 0,
    now: Date.now(),
    ...rawInput,
  };
  const summary = latestSummary(input.issueComments);
  const base = {
    pullNumber: input.pullRequest.number,
    headSha: input.pullRequest.head?.sha,
    draft: input.pullRequest.draft === true,
    codeReview: summary && codeReviewRow(summary.body),
  };
  if (summary && !base.codeReview) {
    return { ...base, action: "hold", reason: "summary-shape-unrecognized" };
  }
  if (base.codeReview?.status === "completed") {
    return completedReport(base, input);
  }
  return pendingDecision(base, input);
}

export { CODEX_BOT, TRIGGER_ACKNOWLEDGE_MS, codexReviewState };
