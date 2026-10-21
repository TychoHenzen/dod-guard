// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { requireScannerQuestions } from "./scanner-plan.mjs";

const SCANNER = [
  { id: "S1", file: "a.mjs" },
  { id: "S2", file: "b.mjs" },
];
const plan = (questions, slot = "file:a.mjs") => [{ slot, questions }];
const refuses = (named) => (error) => error.message.includes(named);

test("a valid scanner list in its own file slot passes", () => {
  const valid = plan([{ id: "D1", scanner: ["S1"] }]);
  assert.doesNotThrow(() => requireScannerQuestions(valid, SCANNER));
});

test("a question with no scanner field passes", () => {
  assert.doesNotThrow(() => requireScannerQuestions(plan([{ id: "D1" }]), SCANNER));
});

test("a scanner field that is not an array is refused", () => {
  const scalar = plan([{ id: "D1", scanner: "S1" }]);
  assert.throws(
    () => requireScannerQuestions(scalar, SCANNER),
    refuses("question D1 has a scanner list that is not an array of S ids"),
  );
});

test("a scanner list in a criterion slot is refused as not a file slot", () => {
  const criterion = plan([{ id: "F2", scanner: ["S1"] }], "criterion:1");
  assert.throws(
    () => requireScannerQuestions(criterion, SCANNER),
    refuses("question F2 is in slot criterion:1, not a file slot, but lists S1"),
  );
});

test("an unknown S id is refused", () => {
  const unknown = plan([{ id: "D1", scanner: ["S9"] }]);
  assert.throws(
    () => requireScannerQuestions(unknown, SCANNER),
    refuses("question D1 lists S9, which is not a scanner violation"),
  );
});

test("an S id in another file than the slot is refused with both file names", () => {
  const other = plan([{ id: "D1", scanner: ["S2"] }]);
  assert.throws(
    () => requireScannerQuestions(other, SCANNER),
    refuses("question D1 lists S2, which is in b.mjs, not in its slot's file a.mjs"),
  );
});

test("two problems are named in one message", () => {
  const two = plan([
    { id: "D1", scanner: ["S2"] },
    { id: "D2", scanner: ["S9"] },
  ]);
  assert.throws(() => requireScannerQuestions(two, SCANNER), refuses("question D1 lists S2"));
  assert.throws(() => requireScannerQuestions(two, SCANNER), refuses("; question D2 lists S9"));
});
