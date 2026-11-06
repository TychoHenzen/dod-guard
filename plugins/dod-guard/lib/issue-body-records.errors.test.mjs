import assert from "node:assert/strict";
import test from "node:test";
import { body904, replaceOnce } from "./harness/issue-body-fixtures.mjs";
import { parseIssueBodyRecords } from "./issue-body-records.mjs";
import { postPushInput } from "./post-push-input.mjs";
import { jsonBlock, subsections } from "./record-readers.mjs";

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

test("subsections and jsonBlock read the first JSON block under each named heading", () => {
  const notes = "### a\nx\n```json\n[1]\n```\n### b\n```json\n{\n```\n### a\n```json\n[2]\n```\n";

  assert.deepEqual(
    subsections(notes, "a").map((section) => jsonBlock(section).value),
    [[1], [2]],
  );
  assert.deepEqual(jsonBlock(subsections(notes, "b")[0]), { error: "is not valid JSON" });
  assert.deepEqual(jsonBlock("no block"), { error: "has no JSON block" });
  assert.deepEqual(subsections("before\n### a\nx\n### b\ny\n### a\nz\n", "a"), ["x", "z\n"]);
});

test("binds a lens that stores no head to the given head and keeps a stored head", () => {
  const input = { ...parseIssueBodyRecords(body904).input, reviewLenses: [{ id: "a" }, { id: "b", headSha: "old" }] };
  const result = postPushInput({ input, rows: [], headSha: "H" });

  assert.deepEqual(result.reviewLenses, [
    { id: "a", headSha: "H" },
    { id: "b", headSha: "old" },
  ]);
  assert.equal(result.headSha, "H");
  assert.equal(result.plannedAcceptanceMatrix, null);
});
