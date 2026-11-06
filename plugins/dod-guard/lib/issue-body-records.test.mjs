import assert from "node:assert/strict";
import test from "node:test";
import { body904, records904, replaceOnce } from "./harness/issue-body-fixtures.mjs";
import { parseIssueBodyRecords } from "./issue-body-records.mjs";
import { subsections } from "./record-readers.mjs";

test("parses the #904 body into the refinement evaluator input", () => {
  const { input, errors, remainder } = parseIssueBodyRecords(body904);

  assert.deepEqual(errors, []);
  assert.deepEqual(remainder, []);
  assert.deepEqual(parseIssueBodyRecords(body904).requirementRemainder, []);
  assert.deepEqual(Object.keys(input), [
    "records",
    "tasks",
    "children",
    "reviewLenses",
    "acceptance",
    "plannedAcceptanceMatrix",
  ]);
  assert.deepEqual(input.tasks, records904.tasks);
  assert.deepEqual(input.reviewLenses, records904.reviewLenses);
  assert.deepEqual(input.acceptance, records904.acceptance);
  assert.deepEqual(input.children, []);
  assert.deepEqual(
    input.plannedAcceptanceMatrix.map((row) => row.id),
    records904.acceptanceMatrix.map((row) => row.id),
  );
  assert.equal(input.records["lens-ownership"], input.reviewLenses);
  assert.match(input.records.requirements, /\S/);
  assert.match(input.records.clarifications, /\S/);
  assert.match(input.records["implementation-plan"], /\S/);
});

test("reads a CRLF body the same as an LF body", () => {
  assert.deepEqual(parseIssueBodyRecords(body904.replace(/\n/g, "\r\n")), parseIssueBodyRecords(body904));
});

test("cross-checks acceptance-evidence ids against the Acceptance criteria checkboxes", () => {
  const missingBox = parseIssueBodyRecords(replaceOnce(body904, "- [ ] AC-5 ", "- [ ] AC-9 "));
  assert.deepEqual(missingBox.errors, []);
  assert.deepEqual(missingBox.remainder, [
    "AC-9 acceptance criterion has no acceptance-evidence entry",
    "acceptance-evidence entry AC-5 has no Acceptance criteria checkbox",
  ]);

  const noBoxes = parseIssueBodyRecords(body904.replace(/^- \[ \] /gm, "- "));
  assert.deepEqual(noBoxes.remainder, ["Acceptance criteria section has no checkbox"]);
});

test("a heading inside a fenced example stays in the record around it", () => {
  const example = "```md\n### task-list\n```\n\nThe plan continues after the example.\n\n";
  const { input, errors, remainder } = parseIssueBodyRecords(
    replaceOnce(body904, "### task-list\n", `${example}### task-list\n`),
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(remainder, []);
  assert.deepEqual(input.tasks, records904.tasks);
  assert.match(
    input.records["implementation-plan"],
    /```md\n### task-list\n```\n\nThe plan continues after the example\./,
  );
  assert.deepEqual(subsections("### a\n```md\n### a\n```\nafter\n", "a"), ["```md\n### a\n```\nafter\n"]);
});
