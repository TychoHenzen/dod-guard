// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { DROPPED_BUDGET, droppedBlock, idRanges } from "./dropped-block.mjs";

function drop(index, file, overrides = {}) {
  return {
    id: `S${index + 1}`,
    file,
    line: index + 1,
    rule: "line-length",
    reason: "rule-misfire",
    answer: "D1",
    answerText: "Is the line within the repository's own width?",
    message: `line is ${100 + index} chars (width 80)`,
    ...overrides,
  };
}

test("idRanges collapses consecutive S ids and keeps gaps", () => {
  assert.equal(idRanges(["S9", "S3", "S4", "S5", "S12"]), "S3-S5, S9, S12");
  assert.equal(idRanges(["S1"]), "S1");
});

test("a file's drops collapse to one counted line per rule and cited answer", () => {
  const dropped = [
    ...Array.from({ length: 40 }, (_, index) => drop(index, "src/a.cs")),
    drop(40, "src/a.cs", { rule: "file-length", answer: "R1", answerText: "Is the file generated?" }),
  ];
  const block = droppedBlock(dropped);
  assert.ok(block.includes("- `line-length` (rule-misfire, D1) x40: S1-S40"), block);
  assert.ok(block.includes("- `file-length` (rule-misfire, R1) x1: S41"), block);
  assert.ok(!block.includes("chars (width 80)"), block);
});

// PR 48 scale and past it: ~950 interleaved line-length drops are nothing next
// to 5000 drops over 500 long file names, each citing its own long question.
test("5000 drops across 500 files stay within the budget and count the rest", () => {
  const longText = "q".repeat(5000);
  const dropped = Array.from({ length: 5000 }, (_, index) => {
    const file = `src/some/deeply/nested/directory/with/a/long/name/file-${index % 500}.cs`;
    const rule = index % 2 === 0 ? "line-length" : "file-length";
    return drop(index, file, { rule, answer: `Q${index % 500}`, answerText: longText });
  });
  const block = droppedBlock(dropped);
  assert.ok(block.length <= DROPPED_BUDGET + 500, `block is ${block.length} characters`);
  assert.ok(block.includes("<summary>Dropped scanner findings (5000)</summary>"), block);
  assert.match(block, /\.\.\.and \d+ more dropped findings across \d+ more files, counted but not listed\./);
  assert.ok(!block.includes("q".repeat(201)), "a cited question is shortened");
});

test("a single file too large for the budget is counted, not listed", () => {
  const dropped = Array.from({ length: 300 }, (_, index) => drop(index, "src/big.cs", { answer: `Q${index}` }));
  const block = droppedBlock(dropped, 1000);
  assert.ok(block.length < 1000, block);
  assert.ok(block.includes("...and 300 more dropped findings across 1 more files"), block);
});

test("nothing dropped gives no block", () => {
  assert.equal(droppedBlock([]), null);
});
