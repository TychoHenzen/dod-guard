// Closes one planned issue: comment, close, readback. A replaced original also
// re-reads its root first, so the close never rests on the snapshot alone.
import { closeIssue, gh, postComment, readComments, readIssue } from "./closure-github.mjs";
import { parseCompletionRecord, recordComments } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";

const ROOT_KEYS = ["pullRequest", "mergeCommit", "trustedHeadSha"];

function recordMatches(record, close) {
  if (!record || record.pendingRows.length > 0) return false;
  return ROOT_KEYS.every((key) => record[key] === close[key]);
}

function pullMatches(pull, close) {
  return (
    Boolean(pull?.merged_at) && pull.merge_commit_sha === close.mergeCommit && pull.head?.sha === close.trustedHeadSha
  );
}

function confirmRoot(api, close) {
  const { record, error } = parseCompletionRecord(readComments(api, close.root));
  const pull = gh(api.runner, ["api", `repos/${api.repository}/pulls/${close.pullRequest}`]);
  if (recordMatches(record, close) && pullMatches(pull, close)) return;
  const reason = error ?? "record or pull request changed";
  throw new ClosureStop(`root #${close.root} no longer verifies (${reason})`, { issue: close.issue, root: close.root });
}

function readState(api, number) {
  const issue = readIssue(api, number);
  const evidence = recordComments(readComments(api, number), "closure");
  return { state: issue?.state ?? null, stateReason: issue?.state_reason ?? null, evidenceComments: evidence.length };
}

function requireWritable(before, close) {
  if (before.evidenceComments > 1) {
    throw new ClosureStop(`issue #${close.issue} has duplicate closure evidence`, before);
  }
  if (before.state === "closed" && before.evidenceComments === 0) {
    throw new ClosureStop(`issue #${close.issue} was closed outside this plan`, before);
  }
}

function requireClosedAsPlanned(after, close) {
  const closed = after.state === "closed" && after.stateReason === close.stateReason;
  if (!closed || after.evidenceComments !== 1) {
    throw new ClosureStop(`issue #${close.issue} readback disagrees with the planned close`, after);
  }
}

function writeClose({ steps, ...api }, close) {
  const before = readState(api, close.issue);
  if (close.rule === "replaced-original") confirmRoot(api, close);
  steps.push({ issue: close.issue, step: "read" });
  requireWritable(before, close);
  if (before.evidenceComments === 0) {
    postComment(api, close.issue, close.comment);
    steps.push({ issue: close.issue, step: "comment" });
  }
  if (before.state !== "closed") {
    closeIssue(api, close.issue, close.stateReason);
    steps.push({ issue: close.issue, step: "close" });
  }
  const after = readState(api, close.issue);
  steps.push({ issue: close.issue, step: "readback" });
  requireClosedAsPlanned(after, close);
}

export { writeClose };
