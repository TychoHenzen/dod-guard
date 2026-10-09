// Parses and renders the closure records that standards/project-workflow.md
// defines: a replacement root's `supersedes` record and the
// `## Completion evidence` comment, plus the evidence comment a close posts.
// Every function is pure; reading and writing GitHub belongs to the callers.

const COMPLETION_HEADING = "## Completion evidence";
const COMPLETION_MARKER = "<!-- dod-guard-completion-evidence -->";
const CLOSURE_HEADING = "## Closure evidence";
const CLOSURE_MARKER = "<!-- dod-guard-closure-evidence -->";
const FULL_SHA = /^[0-9a-f]{40}$/;
const CHECK_OUTCOMES = new Set(["pass", "fail", "pending"]);
const ISSUE_REFERENCE = /^([\w.-]+\/[\w.-]+)#\d+$/;
// The acceptance matrix has no "pending" status, so a row still needs proof
// after the merge unless it passed or was ruled inapplicable.
const SETTLED_ROW_STATUSES = new Set(["pass", "inapplicable"]);

function lines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n");
}

function implementationNotes(body) {
  const text = lines(body);
  const start = text.search(/^## Implementation notes[ \t]*$/m);
  if (start < 0) return "";
  const rest = text.slice(text.indexOf("\n", start) + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

function subsections(notes, name) {
  const found = [];
  let current = null;
  for (const line of notes.split("\n")) {
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1] === name ? [] : null;
      if (current) found.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  return found.map((section) => section.join("\n"));
}

function jsonBlock(text) {
  const match = /```json\n([\s\S]*?)\n```/.exec(lines(text));
  if (!match) return { error: "has no JSON block" };
  try {
    return { value: JSON.parse(match[1]) };
  } catch {
    return { error: "is not valid JSON" };
  }
}

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
  const records = subsections(implementationNotes(body), "supersedes");
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

function markedComments(comments, marker) {
  return (Array.isArray(comments) ? comments : []).filter((comment) => lines(comment?.body).includes(marker));
}

function completionFieldsError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "is not an object";
  if (!Number.isInteger(value.pullRequest) || value.pullRequest <= 0) return "has no pull request number";
  if (!FULL_SHA.test(value.mergeCommit ?? "")) return "has no full merge commit SHA";
  if (!FULL_SHA.test(value.trustedHeadSha ?? "")) return "has no full trusted head SHA";
  if (!CHECK_OUTCOMES.has(value.requiredChecks)) return "has no required-check outcome";
  if (!Array.isArray(value.pendingRows) || value.pendingRows.some((row) => typeof row !== "string")) {
    return "has no pending-row list";
  }
  return null;
}

// Returns { record: null } when no comment carries the marker, { record } for
// one valid record, and { error } for a duplicate or malformed one.
function parseCompletionRecord(comments) {
  const marked = markedComments(comments, COMPLETION_MARKER);
  if (marked.length === 0) return { record: null };
  if (marked.length > 1) return { error: "duplicate completion evidence record" };
  const body = lines(marked[0].body);
  if (!body.startsWith(COMPLETION_HEADING)) return { error: "completion evidence record lacks its heading" };
  const block = jsonBlock(body);
  if (block.error) return { error: `completion evidence record ${block.error}` };
  const problem = completionFieldsError(block.value);
  if (problem) return { error: `completion evidence record ${problem}` };
  const { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows } = block.value;
  return { record: { commentId: marked[0].id ?? null, pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows } };
}

function pendingMatrixRows(matrix) {
  const rows = Array.isArray(matrix) ? matrix : matrix?.rows;
  if (!Array.isArray(rows)) throw new TypeError("acceptance matrix must be an array of rows.");
  return rows
    .filter((row) => !SETTLED_ROW_STATUSES.has(String(row?.status ?? "").toLowerCase()))
    .map((row) => String(row?.id));
}

function renderCompletionRecord({ pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows }) {
  const fields = { pullRequest, mergeCommit, trustedHeadSha, requiredChecks, pendingRows };
  return [COMPLETION_HEADING, "", COMPLETION_MARKER, "", "```json", JSON.stringify(fields, null, 2), "```"].join("\n");
}

function renderClosureEvidence({ issue, stateReason, evidence }) {
  return [
    CLOSURE_HEADING,
    "",
    CLOSURE_MARKER,
    "",
    `Closed #${issue} as \`${stateReason}\`.`,
    "",
    ...evidence.map((line) => `- ${line}`),
  ].join("\n");
}

export {
  CLOSURE_MARKER,
  COMPLETION_MARKER,
  markedComments,
  parseCompletionRecord,
  parseSupersedes,
  pendingMatrixRows,
  renderClosureEvidence,
  renderCompletionRecord,
};
