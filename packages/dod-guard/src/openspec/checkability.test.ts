import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCommand, isCheckable } from "./checkability.js";

test("isCheckable is true when the intent names a multi-word command in backticks", () => {
  const scenario = { title: "Tests run clean", intent: "`npm test` exits zero" };
  assert.equal(isCheckable(scenario), true);
});

test("isCheckable is false for a bare single-word code span", () => {
  const scenario = {
    title: "One scenario becomes one leaf",
    intent: "the generated DoD contains one leaf, with the scenario's `THEN` line as the leaf intent",
  };
  assert.equal(isCheckable(scenario), false);
});

test("isCheckable is false for plain prose with no code span at all", () => {
  const scenario = { title: "Reviewer checks tone", intent: "the summary reads clearly and stays on topic" };
  assert.equal(isCheckable(scenario), false);
});

test("extractCommand strips the backticks off the first command-shaped span", () => {
  const scenario = { title: "Tests run clean", intent: "`npm test` exits zero" };
  assert.equal(extractCommand(scenario), "npm test");
});

test("extractCommand returns empty string when the scenario is not checkable", () => {
  const scenario = { title: "Reviewer checks tone", intent: "the summary reads clearly and stays on topic" };
  assert.equal(extractCommand(scenario), "");
});
