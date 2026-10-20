import assert from "node:assert/strict";
import test from "node:test";
import { readHandoffMatrix } from "./handoff-matrix.mjs";

const row = { id: "R1", contract: "AC-1", path: "success-line", status: "pass", headSha: "abc1234" };

test("reads the rows of a fenced json block under ## Acceptance matrix", () => {
  const text = [
    "## Implementation handoff",
    "",
    "Prose before the matrix.",
    "",
    "## Acceptance matrix",
    "",
    "```json",
    JSON.stringify([row]),
    "```",
    "",
  ].join("\n");

  assert.deepEqual(readHandoffMatrix(text), { rows: [row] });
});

test("reports a missing section", () => {
  const result = readHandoffMatrix("## Implementation handoff\n\nNo matrix here.\n");

  assert.equal(result.error, "handoff has no ## Acceptance matrix section");
});

test("refuses two matrix headings and ignores one inside a fenced example", () => {
  const block = ["## Acceptance matrix", "", "```json", JSON.stringify([row]), "```", ""].join("\n");
  const twice = readHandoffMatrix(`${block}\n## Notes\n\n${block}`);
  const example = readHandoffMatrix(`## Notes\n\n\`\`\`md\n## Acceptance matrix\n\`\`\`\n\n${block}`);

  assert.equal(twice.error, "handoff has more than one ## Acceptance matrix section");
  assert.deepEqual(example, { rows: [row] });
});

test("reports a table-only matrix", () => {
  const text = ["## Acceptance matrix", "", "| id | status |", "| --- | --- |", "| R1 | pass |", ""].join("\n");
  const result = readHandoffMatrix(text);

  assert.equal(result.error, "acceptance matrix has no JSON block");
});

test("reports invalid JSON in the matrix block", () => {
  const result = readHandoffMatrix('## Acceptance matrix\n\n```json\n[{"id": "R1",,}]\n```\n');

  assert.equal(result.error, "acceptance matrix is not valid JSON");
});

test("reports a matrix block that is not a JSON array", () => {
  const result = readHandoffMatrix('## Acceptance matrix\n\n```json\n{"id": "R1"}\n```\n');

  assert.equal(result.error, "acceptance matrix is not a JSON array");
});
