import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { answerHelpers } from "./review-answers-cli.test-support.mjs";
import { cli } from "./review-batch-cli.test-support.mjs";

const { HEAD, cut, readJson, run, scratch, succeeds } = cli;
const { answerFlags, writeAllAnswers } = answerHelpers;

test("answers merges the files the investigators wrote", () => {
  const dir = scratch();
  const { planHash, batches } = cut(dir);
  writeAllAnswers(dir, batches);
  const out = path.join(dir, "answers.json");
  const counts = succeeds(run("answers", answerFlags(dir, out)));
  const merged = readJson(out);
  const total = batches.reduce((sum, { questions }) => sum + questions, 0);
  assert.equal(merged.planHash, planHash);
  assert.equal(merged.headSha, HEAD);
  assert.equal(merged.answers.length, total);
  assert.deepEqual(counts, { out, answered: total, unanswered: 0 });
});

test("answers refuses a missing file and names it", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  rmSync(path.join(answers, "b01.json"));
  const out = path.join(dir, "answers.json");
  const result = run("answers", answerFlags(dir, out));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Answers refused[\s\S]*b01: answers file .* is missing/);
  assert.throws(() => readFileSync(out), { code: "ENOENT" });
});

test("answers refuses a non-JSON file", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  writeFileSync(path.join(answers, "b01.json"), "{not json");
  const result = run("answers", answerFlags(dir));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Answers refused[\s\S]*b01: Cannot read JSON from .*b01\.json/);
});

// Rewrites b01 with its first answer changed, then runs answers and returns the result and the out path.
function answersAfterEditing(change) {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  const file = path.join(answers, "b01.json");
  const doc = readJson(file);
  writeFileSync(
    file,
    JSON.stringify({ ...doc, answers: doc.answers.map((a, i) => (i === 0 ? { ...a, ...change } : a)) }),
  );
  const out = path.join(dir, "answers.json");
  return { result: run("answers", answerFlags(dir, out)), out };
}

test("answers refuses a citation to a file that is not in the checkout", () => {
  const { result, out } = answersAfterEditing({ path: "gone.mjs" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Answers refused[\s\S]*b01: [\s\S]*"gone\.mjs" is not a file under the checkout/);
  assert.throws(() => readFileSync(out), { code: "ENOENT" });
});

test("answers refuses a citation past the end of the file", () => {
  const { result } = answersAfterEditing({ line: 4 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /"a\.mjs" has 3 lines, so line 4 does not exist/);
});

test("answers without --root prints usage", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  writeAllAnswers(dir, batches);
  const result = run(
    "answers",
    answerFlags(dir).filter((flag) => !flag.startsWith("--root=")),
  );
  assert.equal(result.status, 3);
  assert.ok(result.stderr.startsWith("Usage:"));
});

test("answers refuses a file stamped for another head", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  const stamped = path.join(answers, "b01.json");
  writeFileSync(stamped, JSON.stringify({ ...readJson(stamped), headSha: "f".repeat(40) }));
  const result = run("answers", answerFlags(dir));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /headSha is/);
});
