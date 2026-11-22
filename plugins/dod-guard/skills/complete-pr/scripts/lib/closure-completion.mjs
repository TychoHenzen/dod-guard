// Posts or refreshes one `## Completion evidence` comment on every linked
// closing issue and every finalized child, from the complete-pr merge result.
import { editComment, postComment, readComments } from "./closure-github.mjs";
import { pendingMatrixRows, recordComments, renderCompletionRecord } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;

const isSha = (value) => FULL_SHA.test(value ?? "");

function hasMergeFields({ pullNumber, trustedHead, mergeCommitSha, linkedIssues }) {
  return Number.isInteger(pullNumber) && Array.isArray(linkedIssues) && [trustedHead, mergeCommitSha].every(isSha);
}

function requireMergeResult(result) {
  if (!hasMergeFields(result ?? {})) {
    throw new ClosureStop("merge result needs pullNumber, trustedHead, mergeCommitSha, and linkedIssues", {});
  }
  return result;
}

function writeRecord(api, { number, existing }, body) {
  if (!existing) {
    postComment(api, number, body);
    return "posted";
  }
  if (existing.body.trim() === body) return "unchanged";
  editComment(api, existing.id, body);
  return "updated";
}

function upsertRecord(api, number, body) {
  const marked = recordComments(readComments(api, number), "completion");
  if (marked.length > 1) throw new ClosureStop(`issue #${number} has duplicate completion evidence`, { issue: number });
  const action = writeRecord(api, { number, existing: marked[0] }, body);
  const readback = recordComments(readComments(api, number), "completion");
  if (readback.length !== 1 || readback[0].body.trim() !== body) {
    throw new ClosureStop(`issue #${number} completion evidence readback disagrees`, {
      issue: number,
      records: readback.length,
    });
  }
  return { issue: number, action };
}

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
  const api = { runner, repository };
  const issues = [...new Set([...merge.linkedIssues.map(({ number }) => number), ...children])];
  return { records: issues.map((number) => upsertRecord(api, number, body)) };
}

export { FULL_SHA, recordCompletion, upsertRecord };
