// Executes a closure plan and upserts completion records through the GitHub
// REST API. Every write is preceded by a live read and followed by a readback;
// a disagreement stops with the observed partial state and no further write.
import { writeProjectStatuses } from "../project-status.mjs";
import { planClosures } from "./closure-plan.mjs";
import {
  CLOSURE_MARKER,
  COMPLETION_MARKER,
  markedComments,
  parseCompletionRecord,
  pendingMatrixRows,
  renderCompletionRecord,
} from "./closure-records.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;

class ClosureStop extends Error {
  constructor(message, state) {
    super(message);
    this.name = "ClosureStop";
    this.code = "closure_stop";
    this.state = state;
  }
}

function gh(runner, args) {
  const result = runner(args);
  if (result?.status !== undefined && result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh ${args.slice(0, 4).join(" ")} failed`);
  }
  return result?.stdout ? JSON.parse(result.stdout) : null;
}

function readIssue(runner, repository, number) {
  return gh(runner, ["api", `repos/${repository}/issues/${number}`]);
}

function readComments(runner, repository, number) {
  const pages = gh(runner, ["api", "--paginate", "--slurp", `repos/${repository}/issues/${number}/comments?per_page=100`]);
  return (pages ?? []).flat();
}

function postComment(runner, repository, number, body) {
  gh(runner, ["api", "--method", "POST", `repos/${repository}/issues/${number}/comments`, "-f", `body=${body}`]);
}

function editComment(runner, repository, commentId, body) {
  gh(runner, ["api", "--method", "PATCH", `repos/${repository}/issues/comments/${commentId}`, "-f", `body=${body}`]);
}

function closeIssue(runner, repository, number, stateReason) {
  gh(runner, [
    "api",
    "--method",
    "PATCH",
    `repos/${repository}/issues/${number}`,
    "-f",
    "state=closed",
    "-f",
    `state_reason=${stateReason}`,
  ]);
}

function requireProject(project) {
  const complete = project && ["owner", "number", "statusFieldId", "doneOptionId"].every((key) => project[key]);
  if (!complete) throw new ClosureStop("snapshot.project needs owner, number, statusFieldId, and doneOptionId", { applied: [] });
  return project;
}

// A replaced original closes on the strength of its root's delivery, so the
// root's record and pull request are read again instead of trusting the
// snapshot that planned the close.
function confirmRoot(runner, repository, close) {
  const { record, error } = parseCompletionRecord(readComments(runner, repository, close.root));
  const pull = gh(runner, ["api", `repos/${repository}/pulls/${close.pullRequest}`]);
  const same = record && record.pullRequest === close.pullRequest && record.mergeCommit === close.mergeCommit &&
    record.trustedHeadSha === close.trustedHeadSha && record.pendingRows.length === 0;
  const live = pull?.merged_at && pull.merge_commit_sha === close.mergeCommit && pull.head?.sha === close.trustedHeadSha;
  if (!(same && live)) {
    throw new ClosureStop(`root #${close.root} no longer verifies (${error ?? "record or pull request changed"})`, {
      issue: close.issue,
      root: close.root,
    });
  }
}

function issueState(issue, comments) {
  return {
    state: issue?.state ?? null,
    stateReason: issue?.state_reason ?? null,
    evidenceComments: markedComments(comments, CLOSURE_MARKER).length,
  };
}

function writeClose(runner, repository, close, steps) {
  const before = issueState(readIssue(runner, repository, close.issue), readComments(runner, repository, close.issue));
  if (close.rule === "replaced-original") confirmRoot(runner, repository, close);
  steps.push({ issue: close.issue, step: "read" });
  if (before.evidenceComments > 1) throw new ClosureStop(`issue #${close.issue} has duplicate closure evidence`, before);
  if (before.state === "closed" && before.evidenceComments === 0) {
    throw new ClosureStop(`issue #${close.issue} was closed outside this plan`, before);
  }
  if (before.evidenceComments === 0) {
    postComment(runner, repository, close.issue, close.comment);
    steps.push({ issue: close.issue, step: "comment" });
  }
  if (before.state !== "closed") {
    closeIssue(runner, repository, close.issue, close.stateReason);
    steps.push({ issue: close.issue, step: "close" });
  }
  const after = issueState(readIssue(runner, repository, close.issue), readComments(runner, repository, close.issue));
  steps.push({ issue: close.issue, step: "readback" });
  if (after.state !== "closed" || after.stateReason !== close.stateReason || after.evidenceComments !== 1) {
    throw new ClosureStop(`issue #${close.issue} readback disagrees with the planned close`, after);
  }
}

function writeDone(runner, project, close, steps) {
  writeProjectStatuses({
    owner: project.owner,
    projectNumber: project.number,
    statusFieldId: project.statusFieldId,
    statusOptionId: project.doneOptionId,
    expectedStatus: "Done",
    itemIds: [close.itemId],
    commandRunner: runner,
  });
  steps.push({ issue: close.issue, step: "project-status" });
}

function applyClosures(snapshot, { runner, ...options }) {
  const plan = planClosures(snapshot, options);
  const steps = [];
  const applied = [];
  if (plan.closes.length === 0) return { plan, applied, steps };
  const project = requireProject(snapshot.project);
  for (const close of plan.closes) {
    try {
      writeClose(runner, plan.repository, close, steps);
      writeDone(runner, project, close, steps);
    } catch (error) {
      const state = { ...(error.state ?? { issue: close.issue }), applied, steps };
      throw new ClosureStop(error.message, state);
    }
    applied.push(close.issue);
  }
  return { plan, applied, steps };
}

function requireMergeResult(result) {
  const valid = Number.isInteger(result?.pullNumber) && FULL_SHA.test(result?.trustedHead ?? "") &&
    FULL_SHA.test(result?.mergeCommitSha ?? "") && Array.isArray(result?.linkedIssues);
  if (!valid) throw new ClosureStop("merge result needs pullNumber, trustedHead, mergeCommitSha, and linkedIssues", {});
  return result;
}

function upsertRecord(runner, repository, number, body) {
  const marked = markedComments(readComments(runner, repository, number), COMPLETION_MARKER);
  if (marked.length > 1) throw new ClosureStop(`issue #${number} has duplicate completion evidence`, { issue: number });
  let action = "unchanged";
  if (marked.length === 0) {
    postComment(runner, repository, number, body);
    action = "posted";
  } else if (marked[0].body.trim() !== body) {
    editComment(runner, repository, marked[0].id, body);
    action = "updated";
  }
  const readback = markedComments(readComments(runner, repository, number), COMPLETION_MARKER);
  if (readback.length !== 1 || readback[0].body.trim() !== body) {
    throw new ClosureStop(`issue #${number} completion evidence readback disagrees`, { issue: number, records: readback.length });
  }
  return { issue: number, action };
}

// Posts or refreshes one `## Completion evidence` comment on every linked
// closing issue and every finalized child, from the complete-pr merge result.
function recordCompletion({ repository, result, matrix, children = [], runner }) {
  const merge = requireMergeResult(result);
  const body = renderCompletionRecord({
    pullRequest: merge.pullNumber,
    mergeCommit: merge.mergeCommitSha,
    trustedHeadSha: merge.trustedHead,
    // complete-pr returns a merge result only after every required check passed.
    requiredChecks: "pass",
    pendingRows: pendingMatrixRows(matrix),
  });
  const issues = [...new Set([...merge.linkedIssues.map(({ number }) => number), ...children])];
  return { records: issues.map((number) => upsertRecord(runner, repository, number, body)) };
}

export { ClosureStop, applyClosures, recordCompletion };
