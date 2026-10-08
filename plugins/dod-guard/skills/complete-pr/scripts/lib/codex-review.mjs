// Codex's GitHub code review, read before the merge. /submit-draft-pr asks
// Codex to review the draft; marking the pull request ready starts another
// automatic review. Both report through one summary comment whose "Code
// Review" row names the commit it read and whether it finished, and post their
// findings as one review pinned to that commit.
const CODEX_BOT = "chatgpt-codex-connector[bot]";
const SUMMARY_MARKER = "<!-- codex-pull-request-review-summary -->";
const CODE_REVIEW_LABEL = "**Code Review**";
const CODE_REVIEW_ROW =
  /\*\*Code Review\*\*\s*\|([^|]*)\|\s*`([0-9a-f]{7,40})`\s*\|([^|]*)\|/i;
const SEVERITY_BADGE = /!\[(P\d) Badge\]/;
const FINDING_TITLE = /<\/sub><\/sub>\s*(.+?)\*\*/;
const REVIEW_TRIGGER = /^@codex review\b/i;
const COMPLETED_CELL = /\*\*Completed\*\*/i;
const FAILED_CELL = /\*\*Failed\*\*/i;
const CELL_TIME = /datetime="([^"]+)"/;
// How long Codex gets to pick up a request before the gate stops waiting.
const CODEX_ACKNOWLEDGE_MS = 600_000;

function byCodex(item) {
  return item?.user?.login === CODEX_BOT;
}

function rowStatus(cell) {
  if (COMPLETED_CELL.test(cell)) return "completed";
  if (FAILED_CELL.test(cell)) return "failed";
  return "pending";
}

function isSummary(comment) {
  return byCodex(comment) && Boolean(comment.body?.includes(SUMMARY_MARKER));
}

function codeReviewRow(issueComments) {
  const summary = issueComments.filter(isSummary).at(-1);
  if (!summary) return null;
  // Codex can post the summary with its Security Review row a few seconds
  // before it adds the Code Review row; treat that as no review yet.
  if (!summary.body.includes(CODE_REVIEW_LABEL)) return { status: "absent" };
  const match = summary.body.match(CODE_REVIEW_ROW);
  if (!match) return { status: "unrecognized" };
  const [, cell, commit] = match;
  const time = cell.match(CELL_TIME);
  return {
    status: rowStatus(cell),
    commit,
    updatedAt: time ? Date.parse(time[1]) : Number.NaN,
  };
}

function findingTitle(body) {
  const title = body.match(FINDING_TITLE);
  return (title ? title[1] : body.split("\n")[0]).trim();
}

function finding(comment) {
  const body = comment.body ?? "";
  const badge = body.match(SEVERITY_BADGE);
  return {
    id: `GH-${comment.id}`,
    severity: badge ? badge[1] : "unrated",
    title: findingTitle(body),
    file: comment.path,
    line: comment.line ?? comment.original_line,
    url: comment.html_url,
  };
}

// A finding stays open until someone other than Codex answers it, which is
// how /fix-pr-review records a fix or a reasoned rejection.
function openFindings(commit, { reviews, reviewComments }) {
  const reviewIds = new Set(
    reviews
      .filter((review) => byCodex(review))
      .filter((review) => review.commit_id?.startsWith(commit))
      .map(({ id }) => id),
  );
  const answered = new Set(
    reviewComments
      .filter((comment) => comment.in_reply_to_id && !byCodex(comment))
      .map((comment) => comment.in_reply_to_id),
  );
  return reviewComments
    .filter((comment) => byCodex(comment) && !comment.in_reply_to_id)
    .filter((comment) => reviewIds.has(comment.pull_request_review_id))
    .filter((comment) => !answered.has(comment.id))
    .map(finding);
}

function codexRunning(reactions) {
  return reactions.some(
    (reaction) => byCodex(reaction) && reaction.content === "eyes",
  );
}

// The ready transition starts a fresh review of the same head, so a result
// from before it never counts: the gate waits for the new run, or stops.
function settledResult(row, { readyAt }) {
  return readyAt === undefined || row.updatedAt >= readyAt;
}

function finishedReview(row, input) {
  if (row.status === "failed") {
    return { action: "stop", reason: "codex-review-failed" };
  }
  const findings = openFindings(row.commit, input);
  if (findings.length > 0) {
    return { action: "stop", reason: "codex-review-findings", findings };
  }
  return { action: "pass", reason: "codex-review-clean" };
}

function reviewsAcceptedHead(row, input) {
  if (!row?.commit || row.status === "pending") return false;
  return Boolean(input.acceptedHead?.startsWith(row.commit));
}

function codexTookPart(row, input) {
  const triggered = input.issueComments.some((comment) =>
    REVIEW_TRIGGER.test(comment.body?.trim() ?? ""),
  );
  return Boolean(row) || triggered || input.running;
}

/**
 * Decides whether Codex's review lets the merge go ahead. `waitedMs` is the
 * time the caller has spent polling for Codex after the required checks
 * passed; `readyAt` is set when this run marked the pull request ready.
 * @returns {{action: string, reason: string, findings?: object[]}} where
 *   action is "pass", "wait", or "stop".
 */
function codexReviewGate(rawInput) {
  const base = { issueComments: [], reviews: [], reviewComments: [] };
  const merged = { ...base, reactions: [], waitedMs: 0, ...rawInput };
  const row = codeReviewRow(merged.issueComments);
  const running = codexRunning(merged.reactions) || row?.status === "pending";
  const input = { ...merged, running };

  if (!codexTookPart(row, input)) {
    return { action: "pass", reason: "codex-review-not-used" };
  }
  if (row?.status === "unrecognized") {
    return { action: "stop", reason: "codex-summary-unrecognized" };
  }
  if (reviewsAcceptedHead(row, input) && settledResult(row, input)) {
    return finishedReview(row, input);
  }
  if (running || input.waitedMs < CODEX_ACKNOWLEDGE_MS) {
    return { action: "wait", reason: "codex-review-running" };
  }
  return { action: "stop", reason: "codex-review-missing-for-head" };
}

export { codexReviewGate };
