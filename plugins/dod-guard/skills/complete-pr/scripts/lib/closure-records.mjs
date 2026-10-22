// Parses and renders the closure records that standards/project-workflow.md
// defines: a replacement root's `supersedes` record and the
// `## Completion evidence` comment, plus the evidence comment a close posts.
// Every function is pure; reading and writing GitHub belongs to the callers.
import { lines, markdownSection } from "../../../../lib/acceptance-criteria.mjs";
import { isRecordComment, recordPrefix } from "../../../../lib/comment-record.mjs";
import { jsonBlock, subsections } from "../../../../lib/issue-body-records.mjs";

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
const ISSUE_REFERENCE = /^([\w.-]+\/[\w.-]+)#\d+$/;
// The acceptance matrix has no "pending" status, so a row still needs proof
// after the merge unless it passed or was ruled inapplicable.
const SETTLED_ROW_STATUSES = new Set(["pass", "inapplicable"]);

function supersedesEntryError(entry, repository) {
  if (Number.isInteger(entry) && entry > 0) return null;
  const reference = typeof entry === "string" ? ISSUE_REFERENCE.exec(entry) : null;
  if (reference && reference[1].toLowerCase() !== String(repository).toLowerCase()) {
    return `names cross-repository issue ${entry}`;
  }
  return `has malformed entry ${JSON.stringify(entry)}`;
}

// Returns { numbers: [] } when the body has no record, { numbers } for a valid
// record, and { error } naming why the record cannot be used.
function parseSupersedes(body, repository) {
  const records = subsections(markdownSection(body, "Implementation notes"), "supersedes");
  if (records.length === 0) return { numbers: [] };
  if (records.length > 1) return { error: "duplicate supersedes record" };
  const block = jsonBlock(records[0]);
  if (block.error) return { error: `supersedes record ${block.error}` };
  if (!Array.isArray(block.value) || block.value.length === 0) {
    return { error: "supersedes record is not a non-empty array" };
  }
  for (const entry of block.value) {
    const problem = supersedesEntryError(entry, repository);
    if (problem) return { error: `supersedes record ${problem}` };
  }
  if (new Set(block.value).size !== block.value.length) {
    return { error: "supersedes record repeats an issue number" };
  }
  return { numbers: block.value };
}

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

// Returns { record: null } when no comment is a completion record, { record } for
// one valid record, and { error } for a duplicate or malformed one.
function parseCompletionRecord(comments) {
  const marked = recordComments(comments, "completion");
  if (marked.length === 0) return { record: null };
  if (marked.length > 1) return { error: "duplicate completion evidence record" };
  const body = lines(marked[0].body);
  const block = jsonBlock(body);
  if (block.error) return { error: `completion evidence record ${block.error}` };
  const problem = completionFieldsError(block.value);
  if (problem) return { error: `completion evidence record ${problem}` };
  const { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows } = block.value;
  return {
    record: { commentId: marked[0].id ?? null, pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows },
  };
}

function pendingMatrixRows(matrix) {
  if (!Array.isArray(matrix)) throw new TypeError("acceptance matrix must be an array of rows.");
  return matrix
    .filter((row) => !SETTLED_ROW_STATUSES.has(String(row?.status ?? "").toLowerCase()))
    .map((row) => String(row?.id));
}

function renderCompletionRecord({ pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows }) {
  const fields = { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows };
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
  parseSupersedes,
  pendingMatrixRows,
  RECORD_KINDS,
  recordComments,
  renderClosureEvidence,
  renderCompletionRecord,
};
