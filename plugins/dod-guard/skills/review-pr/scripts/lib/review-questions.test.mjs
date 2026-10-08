// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { questionsBlock, requirePlanCoverage } from "./review-questions.mjs";

const LENSES = ["review-pr-feature", "review-pr-design", "review-pr-reliability", "review-pr-hygiene"];
const planned = () =>
  LENSES.map((lens, index) => ({
    lens,
    id: `Q${index + 1}`,
    question: "What holds?",
    files: ["src/a.mjs"],
    status: "verified",
  }));

test("every lens needs at least one planned question", () => {
  assert.throws(() => questionsBlock(planned().slice(1)), /No planned review questions for review-pr-feature/);
});

test("a question needs a known lens, an id, text, files, and a known status", () => {
  for (const change of [
    { lens: "review-pr-style" },
    { id: " " },
    { question: "" },
    { status: "failed" },
    { files: [] },
    { files: [" "] },
    { files: undefined },
  ]) {
    const questions = planned();
    questions[0] = { ...questions[0], ...change };
    assert.throws(
      () => questionsBlock(questions),
      /needs a reviewer lens, an id, a question, a files list, and a status/,
    );
  }
  assert.throws(() => questionsBlock({}), /must be a JSON array/);
});

test("question ids are unique", () => {
  const questions = [...planned(), { ...planned()[0] }];
  assert.throws(() => questionsBlock(questions), /Q1 appears more than once/);
});

test("repaired and unanswered questions keep their status in the block", () => {
  const questions = planned();
  questions[1] = { ...questions[1], status: "repaired" };
  questions[2] = { ...questions[2], status: "unanswered" };
  const block = questionsBlock(questions);
  assert.match(block, /^- Q2 \(repaired\): What holds\?$/m);
  assert.match(block, /^- Q3 \(unanswered\): What holds\?$/m);
});

test("the plan must name every changed file in a question or an exclusion", () => {
  const changed = ["src/a.mjs", "dist/bundle.js"];
  assert.throws(
    () => requirePlanCoverage(planned(), changed),
    /No planned review question or exclusion names dist\/bundle\.js/,
  );

  const excluded = {
    lens: "review-pr-hygiene",
    id: "H9",
    question: "Generated bundle; its source changes are reviewed instead.",
    files: ["dist\\bundle.js"],
    status: "excluded",
  };
  assert.doesNotThrow(() => requirePlanCoverage([...planned(), excluded], changed));
  assert.match(questionsBlock([...planned(), excluded]), /^- H9 \(excluded\): Generated bundle;/m);
});
