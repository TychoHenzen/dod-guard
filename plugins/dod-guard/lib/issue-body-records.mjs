// Reads the named records under an issue body's `## Implementation notes`
// (`### <name>` subsections, standards/project-workflow.md) into the input
// that the next-ticket convergence proof evaluates. Every function is pure;
// reading the issue from GitHub belongs to the callers.
import { lines, markdownSection } from "./acceptance-criteria.mjs";
import { acceptanceIdRemainder, requirementIdRemainder } from "./record-id-remainders.mjs";
import { JSON_RECORDS, jsonRecord, TEXT_RECORDS, textRecord } from "./record-readers.mjs";

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

// Reads all seven records in the order of their tables; every unreadable one
// adds an error and leaves null.
function readRecords(notes, errors) {
  const records = {};
  for (const name of TEXT_RECORDS) records[name] = textRecord(notes, name, errors);
  for (const name of JSON_RECORDS) records[name] = jsonRecord(notes, name, errors);
  return records;
}

// Returns { input, errors, remainder, requirementRemainder }: the
// evaluateConvergence input, one error per record that cannot be read, one
// remainder entry per acceptance-evidence id that disagrees with the Acceptance
// criteria checkboxes, and one requirementRemainder entry per requirement-id
// disagreement, applied by the refinement proof only.
function parseIssueBodyRecords(body) {
  const text = lines(body);
  const notes = markdownSection(text, "Implementation notes");
  const errors = notes.trim() ? [] : ["body has no ## Implementation notes section"];
  const records = readRecords(notes, errors);
  const acceptance = records["acceptance-evidence"];
  return {
    input: evaluatorInput(records),
    errors,
    remainder: acceptance ? acceptanceIdRemainder(text, acceptance) : [],
    requirementRemainder: records.requirements ? requirementIdRemainder(text, records.requirements) : [],
  };
}

export { parseIssueBodyRecords };
