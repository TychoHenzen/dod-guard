// Codex's GitHub code review, read before the merge. /submit-draft-pr asks
// Codex to review the draft; marking the pull request ready starts another
// automatic review. Both report through one summary comment whose "Code
// Review" row names the commit it read and whether it finished, and post their
// findings as one review pinned to that commit.
const CODEX_BOT = "chatgpt-codex-connector[bot]";
const SUMMARY_MARKER = "<!-- codex-pull-request-review-summary -->";
const CODE_REVIEW_ROW = /\*\*Code Review\*\*\s*\|([^|]*)\|\s*`([0-9a-f]{7,40})`\s*\|([^|]*)\|/i;
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

function codeReviewRow(issueComments) {
  const summary = issueComments.filter((comment) => byCodex(comment) && comment.body?.includes(SUMMARY_MARKER)).at(-1);
  if (!summary) return null;
  const match = summary.body.match(CODE_REVIEW_ROW);
  if (!match) return { status: "unrecognized" };
  return { status: rowStatus(match[1]), commit: match[2], updatedAt: Date.parse(match[1].match(CELL_TIME)?.[1] ?? "") };
}

function finding(comment) {
  const body = comment.body ?? "";
  return {
    id: `GH-${comment.id}`,
    severity: body.match(SEVERITY_BADGE)?.[1] ?? "unrated",
    title: (body.match(FINDING_TITLE)?.[1] ?? body.split("\n")[0]).trim(),
    file: comment.path,
    line: comment.line ?? comment.original_line,
    url: comment.html_url,
  };
}

// A finding stays open until someone other than Codex answers it, which is
// how /fix-pr-review records a fix or a reasoned rejection.
function openFindings(commit, { reviews, reviewComments }) {
  const reviewIds = new Set(
    reviews.filter((review) => byCodex(review) && review.commit_id?.startsWith(commit)).map(({ id }) => id),
  );
  const answered = new Set(
    reviewComments.filter((comment) => comment.in_reply_to_id && !byCodex(comment)).map((comment) => comment.in_reply_to_id),
  );
  return reviewComments
    .filter((comment) => byCodex(comment) && !comment.in_reply_to_id && reviewIds.has(comment.pull_request_review_id))
    .filter((comment) => !answered.has(comment.id))
    .map(finding);
}

function codexRunning(reactions) {
  return reactions.some((reaction) => byCodex(reaction) && reaction.content === "eyes");
}

// The ready transition starts a fresh review of the same head. A result from
// before it counts only once Codex has had time to start that run and has not.
function settledResult(row, { readyAt, running, waitedMs }) {
  if (readyAt === undefined || row.updatedAt >= readyAt) return true;
  return !running && waitedMs >= CODEX_ACKNOWLEDGE_MS;
}

/**
 * Decides whether Codex's review lets the merge go ahead. `waitedMs` counts
 * from the start of the gate; `readyAt` is set when this run marked the pull
 * request ready.
 * @returns {{action: "pass"|"wait"|"stop", reason: string, findings?: object[]}}
 */
function codexReviewGate(rawInput) {
  const input = { issueComments: [], reviews: [], reviewComments: [], reactions: [], waitedMs: 0, ...rawInput };
  const row = codeReviewRow(input.issueComments);
  const triggered = input.issueComments.some((comment) => REVIEW_TRIGGER.test(comment.body?.trim() ?? ""));
  const running = codexRunning(input.reactions) || row?.status === "pending";

  if (!(row || triggered || running)) return { action: "pass", reason: "codex-review-not-used" };
  if (row?.status === "unrecognized") return { action: "stop", reason: "codex-summary-unrecognized" };

  const current = Boolean(row?.commit && input.acceptedHead?.startsWith(row.commit));
  if (current && row.status !== "pending" && settledResult(row, { ...input, running })) {
    if (row.status === "failed") return { action: "stop", reason: "codex-review-failed" };
    const findings = openFindings(row.commit, input);
    if (findings.length > 0) return { action: "stop", reason: "codex-review-findings", findings };
    return { action: "pass", reason: "codex-review-clean" };
  }
  if (running || input.waitedMs < CODEX_ACKNOWLEDGE_MS) return { action: "wait", reason: "codex-review-running" };
  return { action: "stop", reason: "codex-review-missing-for-head" };
}

export { CODEX_ACKNOWLEDGE_MS, CODEX_BOT, codexReviewGate };
