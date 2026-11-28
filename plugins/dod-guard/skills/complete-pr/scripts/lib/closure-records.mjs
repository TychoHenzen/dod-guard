// Parses and renders the closure records that standards/project-workflow.md
// defines: the `## Completion evidence` comment, plus the evidence comment a
// close posts. Every function is pure; reading and writing GitHub belongs to
// the callers.
import { lines } from "../../../../lib/acceptance-criteria.mjs";
import { isRecordComment, recordPrefix } from "../../../../lib/comment-record.mjs";
import { jsonBlock } from "../../../../lib/record-readers.mjs";

const COMPLETION_HEADING = "## Completion evidence";
const COMPLETION_MARKER = "<!-- dod-guard-completion-evidence -->";
const CLOSURE_HEADING = "## Closure evidence";
const CLOSURE_MARKER = "<!-- dod-guard-closure-evidence -->";
// The two comment records this module renders. A record's identity is its
// rendered prefix, so the renderers and isRecord read the same table.
const RECORD_KINDS = Object.freeze({
  completion: Object.freeze({ heading: COMPLETION_HEADING, marker: COMPLETION_MARKER }),
  closure: Object.freeze({ heading: CLOSURE_HEADING, marker: CLOSURE_MARKER }),
});

function kindOf(kind) {
  const record = Object.hasOwn(RECORD_KINDS, kind) ? RECORD_KINDS[kind] : null;
  if (!record) throw new TypeError(`unknown closure record kind: ${kind}`);
  return record;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const CHECK_OUTCOMES = new Set(["pass", "fail", "pending"]);
// The acceptance matrix has no "pending" status, so a row still needs proof
// after the merge unless it passed or was ruled inapplicable.
const SETTLED_ROW_STATUSES = new Set(["pass", "inapplicable"]);
// The flags a record of a ticket with no structured handoff carries: legacy for one delivered before the
// handoff existed, ordinary for an ordinary-path ticket. Both are informational; the delivery judgement
// reads the record and the live pull request the same way whichever flag it holds.
const UNSTRUCTURED_FLAGS = ["legacy", "ordinary"];

function isRecord(comment, kind) {
  return isRecordComment(comment, kindOf(kind));
}

function recordComments(comments, kind) {
  return (Array.isArray(comments) ? comments : []).filter((comment) => isRecord(comment, kind));
}

// Each row is [message, passes]. The first failing row names why the record is unusable.
const COMPLETION_FIELD_CHECKS = [
  ["has no pull request number", (value) => Number.isInteger(value.pullRequest) && value.pullRequest > 0],
  ["has no full merge commit SHA", (value) => FULL_SHA.test(value.mergeCommit ?? "")],
  ["has no full trusted head SHA", (value) => FULL_SHA.test(value.trustedHeadSha ?? "")],
  ["has no required-check outcome", (value) => CHECK_OUTCOMES.has(value.requiredChecks)],
  [
    "has no pending-row list",
    (value) => Array.isArray(value.pendingRows) && value.pendingRows.every((row) => typeof row === "string"),
  ],
];

function completionFieldsError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "is not an object";
  const failed = COMPLETION_FIELD_CHECKS.find(([, passes]) => !passes(value));
  return failed ? failed[0] : null;
}

// The record's fields, plus each unstructured flag that source holds as true.
function withFlags(fields, source) {
  const flags = UNSTRUCTURED_FLAGS.filter((flag) => source[flag] === true);
  return { ...fields, ...Object.fromEntries(flags.map((flag) => [flag, true])) };
}

function completionRecordOf(comment) {
  const block = jsonBlock(lines(comment.body));
  const problem = block.error || completionFieldsError(block.value);
  if (problem) return { error: `completion evidence record ${problem}` };
  const { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows } = block.value;
  const fields = { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows };
  return { record: withFlags({ commentId: comment.id ?? null, ...fields }, block.value) };
}

// Returns { record: null } when no comment is a completion record, { record } for
// one valid record, and { error } for a duplicate or malformed one.
function parseCompletionRecord(comments) {
  const marked = recordComments(comments, "completion");
  if (marked.length === 0) return { record: null };
  if (marked.length > 1) return { error: "duplicate completion evidence record" };
  return completionRecordOf(marked[0]);
}

function pendingMatrixRows(matrix) {
  if (!Array.isArray(matrix)) throw new TypeError("acceptance matrix must be an array of rows.");
  return matrix
    .filter((row) => !SETTLED_ROW_STATUSES.has(String(row?.status ?? "").toLowerCase()))
    .map((row) => String(row?.id));
}

function renderCompletionRecord(record) {
  const { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows } = record;
  const fields = withFlags({ pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows }, record);
  return [recordPrefix(kindOf("completion")), "", "```json", JSON.stringify(fields, null, 2), "```"].join("\n");
}

function renderClosureEvidence({ issue, stateReason, evidence }) {
  return [
    recordPrefix(kindOf("closure")),
    "",
    `Closed #${issue} as \`${stateReason}\`.`,
    "",
    ...evidence.map((line) => `- ${line}`),
  ].join("\n");
}

export {
  isRecord,
  parseCompletionRecord,
  pendingMatrixRows,
  RECORD_KINDS,
  recordComments,
  renderClosureEvidence,
  renderCompletionRecord,
};
