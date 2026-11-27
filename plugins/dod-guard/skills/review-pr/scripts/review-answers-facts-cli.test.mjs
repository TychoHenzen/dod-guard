import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { answerHelpers } from "./review-answers-cli.test-support.mjs";
import { cli } from "./review-batch-cli.test-support.mjs";

const { cut, readJson, run, scratch, succeeds } = cli;
const { answerFlags, writeAllAnswers } = answerHelpers;
const USAGE_EXIT = 3;
const OUTSIDE = /is outside the checkout/;

// Cuts the batches, writes a facts file beside the answers directory, and points b01's first answer at its line 2.
function citingFacts() {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  const facts = path.join(dir, "git-facts.txt");
  writeFileSync(facts, "head 0a0a\nbase 1b1b\n");
  const file = path.join(answers, "b01.json");
  const doc = readJson(file);
  const [first, ...rest] = doc.answers;
  writeFileSync(file, JSON.stringify({ ...doc, answers: [{ ...first, path: facts, line: 2 }, ...rest] }));
  return { dir, facts, out: path.join(dir, "answers.json") };
}

test("answers accepts a citation to the facts file --facts names", () => {
  const { dir, facts, out } = citingFacts();
  succeeds(run("answers", [...answerFlags(dir, out), `--facts=${facts}`]));
  assert.equal(readJson(out).answers[0].path, facts);
});

test("answers refuses a citation to a facts file it was not given", () => {
  const { dir, facts, out } = citingFacts();
  const result = run("answers", answerFlags(dir, out));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, OUTSIDE);
  assert.ok(result.stderr.includes(JSON.stringify(facts)));
});

test("answers with an empty --facts prints usage", () => {
  const { dir, out } = citingFacts();
  const result = run("answers", [...answerFlags(dir, out), "--facts"]);
  assert.equal(result.status, USAGE_EXIT);
  assert.ok(result.stderr.startsWith("Usage:"));
});
