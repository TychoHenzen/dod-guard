import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { jsonBlock, parseIssueBodyRecords, subsections } from "./issue-body-records.mjs";

const body904 = await readFile(new URL("./fixtures/issue-904-body.md", import.meta.url), "utf8");
// The same #904 records, taken from the live body when the fixture was made.
const records904 = JSON.parse(
  await readFile(new URL("../skills/next-ticket/scripts/fixtures/issue-904-handoff.json", import.meta.url), "utf8"),
);

const replaceOnce = (text, from, to) => {
  assert.ok(text.includes(from), `fixture holds ${from}`);
  return text.replace(from, to);
};

test("parses the #904 body into the refinement evaluator input", () => {
  const { input, errors, remainder } = parseIssueBodyRecords(body904);

  assert.deepEqual(errors, []);
  assert.deepEqual(remainder, []);
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

test("names a missing, duplicated, empty, block-less, invalid, or non-array record", () => {
  const cases = [
    [
      replaceOnce(body904, "### planned-acceptance-matrix\n", "### planned-matrix\n"),
      "missing planned-acceptance-matrix record",
    ],
    [
      `${body904.replace("## Acceptance criteria", "### task-list\n\n```json\n[]\n```\n\n## Acceptance criteria")}`,
      "duplicate task-list record",
    ],
    [
      replaceOnce(body904, '```json\n[\n  {"id": "AC-1"', '```text\n[\n  {"id": "AC-1"'),
      "acceptance-evidence record has no JSON block",
    ],
    [
      replaceOnce(body904, '```json\n[\n  {"id": "AC-1"', '```json\n[\n  {"id": "AC-1",,'),
      "acceptance-evidence record is not valid JSON",
    ],
  ];
  for (const [body, error] of cases) {
    assert.ok(parseIssueBodyRecords(body).errors.includes(error), error);
  }
  const notArray = body904.replace(
    /### lens-ownership\n[\s\S]*?```json\n[\s\S]*?\n```/,
    "### lens-ownership\n\n```json\n{}\n```",
  );
  assert.deepEqual(parseIssueBodyRecords(notArray).errors, ["lens-ownership record is not a JSON array"]);
  const empty = body904.replace(/### requirements\n[\s\S]*?(?=### clarifications)/, "### requirements\n\n");
  assert.deepEqual(parseIssueBodyRecords(empty).errors, ["requirements record is empty"]);
  const noNotes = parseIssueBodyRecords(replaceOnce(body904, "## Implementation notes\n", "## Notes\n"));
  assert.equal(noNotes.errors[0], "body has no ## Implementation notes section");
  assert.ok(noNotes.errors.includes("missing task-list record"));
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

test("subsections and jsonBlock read the first JSON block under each named heading", () => {
  const notes = "### a\nx\n```json\n[1]\n```\n### b\n```json\n{\n```\n### a\n```json\n[2]\n```\n";

  assert.deepEqual(
    subsections(notes, "a").map((section) => jsonBlock(section).value),
    [[1], [2]],
  );
  assert.deepEqual(jsonBlock(subsections(notes, "b")[0]), { error: "is not valid JSON" });
  assert.deepEqual(jsonBlock("no block"), { error: "has no JSON block" });
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
