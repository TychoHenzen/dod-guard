// Reads the named records under an issue body's `## Implementation notes`
// (`### <name>` subsections, standards/project-workflow.md) into the input
// that the next-ticket convergence proof evaluates. complete-pr's closure
// records use the same subsection and JSON-block readers. Every function is
// pure; reading the issue from GitHub belongs to the callers.
import { acceptanceCriteria, lines, markdownSection, markedLines } from "./acceptance-criteria.mjs";

// Returns the text of every `### <name>` subsection, in document order. A
// heading inside a fenced code block is an example, not a record, so it stays
// in the text of the record around it.
function subsections(notes, name) {
  const found = [];
  let current = null;
  for (const line of markedLines(notes)) {
    const heading = line.fenced ? null : /^### (.+?)\s*$/.exec(line.text);
    if (heading) {
      current = heading[1] === name ? [] : null;
      if (current) found.push(current);
    } else if (current) {
      current.push(line.text);
    }
  }
  return found.map((section) => section.join("\n"));
}

// Returns { value } for the first JSON block in the text, else { error }.
function jsonBlock(text) {
  const match = /```json\n([\s\S]*?)\n```/.exec(lines(text));
  if (!match) return { error: "has no JSON block" };
  try {
    return { value: JSON.parse(match[1]) };
  } catch {
    return { error: "is not valid JSON" };
  }
}

const TEXT_RECORDS = Object.freeze(["requirements", "clarifications", "implementation-plan"]);
const JSON_RECORDS = Object.freeze(["task-list", "lens-ownership", "acceptance-evidence", "planned-acceptance-matrix"]);

function onlyRecord(notes, name, errors) {
  const found = subsections(notes, name);
  if (found.length === 0) errors.push(`missing ${name} record`);
  if (found.length > 1) errors.push(`duplicate ${name} record`);
  return found.length === 1 ? found[0] : null;
}

function textRecord(notes, name, errors) {
  const text = onlyRecord(notes, name, errors)?.trim();
  if (text === "") errors.push(`${name} record is empty`);
  return text ? text : null;
}

function jsonRecord(notes, name, errors) {
  const section = onlyRecord(notes, name, errors);
  if (section === null) return null;
  const block = jsonBlock(section);
  if (block.error) {
    errors.push(`${name} record ${block.error}`);
    return null;
  }
  if (!Array.isArray(block.value)) {
    errors.push(`${name} record is not a JSON array`);
    return null;
  }
  return block.value;
}

// A checkbox opens with its criterion id, such as "AC-1" in "- [ ] AC-1 ...".
function checkboxIds(body) {
  return acceptanceCriteria(body)
    .map((criterion) => /^[*_`]*([^\s*_`:]+)/.exec(criterion.text)?.[1])
    .filter(Boolean);
}

function acceptanceIdRemainder(body, acceptance) {
  const boxIds = checkboxIds(body);
  if (boxIds.length === 0) return ["Acceptance criteria section has no checkbox"];
  const evidenceIds = acceptance.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : "")).filter(Boolean);
  return [
    ...boxIds
      .filter((id) => !evidenceIds.includes(id))
      .map((id) => `${id} acceptance criterion has no acceptance-evidence entry`),
    ...evidenceIds
      .filter((id) => !boxIds.includes(id))
      .map((id) => `acceptance-evidence entry ${id} has no Acceptance criteria checkbox`),
  ];
}

// The refinement proof runs before push, so the input has no observed matrix
// or head. Linked children live outside the body, so callers supply them.
function evaluatorInput(records) {
  const list = (name) => records[name] ?? [];
  return {
    records,
    tasks: list("task-list"),
    children: [],
    reviewLenses: list("lens-ownership"),
    acceptance: list("acceptance-evidence"),
    plannedAcceptanceMatrix: list("planned-acceptance-matrix"),
  };
}

// Returns { input, errors, remainder }: the evaluateConvergence input, one
// error per record that cannot be read, and one remainder entry per
// acceptance-evidence id that disagrees with the Acceptance criteria checkboxes.
function parseIssueBodyRecords(body) {
  const text = lines(body);
  const notes = markdownSection(text, "Implementation notes");
  const errors = notes.trim() ? [] : ["body has no ## Implementation notes section"];
  const records = {};
  for (const name of TEXT_RECORDS) records[name] = textRecord(notes, name, errors);
  for (const name of JSON_RECORDS) records[name] = jsonRecord(notes, name, errors);
  const acceptance = records["acceptance-evidence"];
  return {
    input: evaluatorInput(records),
    errors,
    remainder: acceptance ? acceptanceIdRemainder(text, acceptance) : [],
  };
}

// Returns the evaluateConvergence input for the post-push proof: the parsed
// records with the observed acceptance matrix and the pushed head. The planned
// matrix is dropped, since observed mode reads only the observed rows. A lens
// entry holds no head of its own; the pushed head the caller passes is the
// head every such lens is bound to. A lens that does store a different head
// stays stale, so structured-workflow-proof.mjs reports it.
function bindLensHead(lens, headSha) {
  if (!lens || typeof lens !== "object") {
    return lens;
  }
  if (lens.headSha !== undefined || lens.head !== undefined) {
    return lens;
  }
  return { ...lens, headSha };
}

function postPushInput({ input, rows, headSha }) {
  return {
    ...input,
    plannedAcceptanceMatrix: null,
    acceptanceMatrix: rows,
    headSha,
    reviewLenses: input.reviewLenses.map((lens) => bindLensHead(lens, headSha)),
  };
}

export { jsonBlock, parseIssueBodyRecords, postPushInput, subsections };
