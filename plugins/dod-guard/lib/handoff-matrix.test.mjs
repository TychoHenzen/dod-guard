import assert from "node:assert/strict";
import test from "node:test";
import { DIFF_CHECK } from "./carry-forward-record.mjs";
import { joinPlannedRows, readHandoffMatrix } from "./handoff-matrix.mjs";

const HEAD = "abc1234";
const fullRow = { id: "R1", contract: "AC-1", path: "success-line", status: "pass", headSha: HEAD };
const compactRow = { id: "R1", contract: "AC-1", status: "pass", observed: "the OK line printed" };
const planned = {
  id: "R1",
  contract: "AC-1",
  path: "success-line",
  proof: "proof-ac1",
  evidence: "ev-ac1",
  expected: "an OK line",
  status: "pending",
};

function handoff(value) {
  return ["## Implementation handoff", "", "## Acceptance matrix", "", "```json", value, "```", ""].join("\n");
}

function compact(rows, headSha = HEAD) {
  return handoff(
    `{"headSha":${JSON.stringify(headSha)},"rows":[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]}`,
  );
}

test("reads an older handoff's JSON array of full rows as it is", () => {
  const text = handoff(JSON.stringify([fullRow]));
  assert.deepEqual(readHandoffMatrix(text), { rows: [fullRow], headSha: HEAD, compact: false });
  assert.deepEqual(readHandoffMatrix(handoff("[]")), { rows: [], headSha: undefined, compact: false });
});

test("reads the compact shape and stamps the matrix head on every row", () => {
  const carried = { ...compactRow, id: "R2", carryForward: { fromHead: "def5678", paths: ["a.md"] } };
  const read = readHandoffMatrix(compact([compactRow, carried]));
  assert.equal(read.compact, true);
  assert.equal(read.headSha, HEAD);
  assert.deepEqual(read.rows, [
    { ...compactRow, headSha: HEAD },
    {
      ...compactRow,
      id: "R2",
      headSha: HEAD,
      carryForward: { baseHead: "def5678", newHead: HEAD, paths: ["a.md"], diffCheck: DIFF_CHECK },
    },
  ]);
});

test("refuses a compact row that copies a field the issue body or the head owns", () => {
  for (const field of ["path", "proof", "expected", "evidence", "headSha"]) {
    const read = readHandoffMatrix(compact([{ ...compactRow, [field]: "x" }]));
    assert.equal(read.error, `acceptance matrix row R1 holds ${field}, which the issue body or the matrix head owns`);
  }
  const carry = readHandoffMatrix(compact([{ ...compactRow, carryForward: { fromHead: "d", newHead: "e" } }]));
  assert.equal(carry.error, "acceptance matrix row R1 carryForward holds newHead, which is not fromHead or paths");
});

test("names every problem with the compact shape itself", () => {
  const cases = [
    ['{"rows":[]}', "acceptance matrix needs a headSha"],
    ['{"headSha":"abc1234","rows":{}}', "acceptance matrix rows is not a JSON array"],
    ['{"headSha":"abc1234","rows":[],"extra":1}', "acceptance matrix holds extra, which is not headSha or rows"],
    ['{"headSha":"abc1234","rows":[{"status":"pass"}]}', "acceptance matrix row 1 needs an id"],
    ['{"headSha":"abc1234","rows":["R1"]}', "acceptance matrix row 1 is not an object"],
    ['"R1"', "acceptance matrix is not a JSON object of headSha and rows"],
  ];
  for (const [value, error] of cases) {
    assert.equal(readHandoffMatrix(handoff(value)).error, error, value);
  }
});

test("joins each compact row to its planned row by id, in the older key order", () => {
  const joined = joinPlannedRows(readHandoffMatrix(compact([compactRow])), [planned]);
  assert.deepEqual(joined.problems, []);
  assert.deepEqual(Object.keys(joined.rows[0]), [
    "id",
    "contract",
    "path",
    "proof",
    "expected",
    "observed",
    "status",
    "evidence",
    "headSha",
  ]);
  assert.deepEqual(joined.rows[0], {
    id: "R1",
    contract: "AC-1",
    path: "success-line",
    proof: "proof-ac1",
    expected: "an OK line",
    observed: "the OK line printed",
    status: "pass",
    evidence: "ev-ac1",
    headSha: HEAD,
  });
});

test("reports each row the join cannot pair, and passes the older shape through", () => {
  const rows = [
    compactRow,
    { ...compactRow },
    { ...compactRow, id: "R9" },
    { ...compactRow, id: "R2", contract: "AC-9" },
  ];
  const plannedRows = [planned, { ...planned, id: "R2", contract: "AC-2" }, { ...planned, id: "R3" }];
  assert.deepEqual(joinPlannedRows(readHandoffMatrix(compact(rows)), plannedRows).problems, [
    "acceptance matrix row R1 appears more than once",
    "acceptance matrix row R9 matches no planned row in the issue body",
    'acceptance matrix row R2 names contract "AC-9", but its planned row names AC-2',
    "planned row R3 has no acceptance matrix row",
  ]);
  const older = readHandoffMatrix(handoff(JSON.stringify([fullRow])));
  assert.deepEqual(joinPlannedRows(older, []), { rows: [fullRow], problems: [] });
});

test("reports a missing section", () => {
  const result = readHandoffMatrix("## Implementation handoff\n\nNo matrix here.\n");

  assert.equal(result.error, "handoff has no ## Acceptance matrix section");
});

test("refuses two matrix headings and ignores one inside a fenced example", () => {
  const block = ["## Acceptance matrix", "", "```json", JSON.stringify([fullRow]), "```", ""].join("\n");
  const twice = readHandoffMatrix(`${block}\n## Notes\n\n${block}`);
  const example = readHandoffMatrix(`## Notes\n\n\`\`\`md\n## Acceptance matrix\n\`\`\`\n\n${block}`);

  assert.equal(twice.error, "handoff has more than one ## Acceptance matrix section");
  assert.deepEqual(example.rows, [fullRow]);
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
