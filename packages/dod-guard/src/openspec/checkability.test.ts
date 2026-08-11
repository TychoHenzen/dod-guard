import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWED_EXECUTABLES, extractCommand, isCheckable, isRunnable } from "./checkability.js";

test("isCheckable is true when the intent names a command whose first token is a known executable", () => {
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

// Verbatim from the real failure that motivated this rule (see checkability.ts).
const PROSE_FRAGMENTS = [
  "holds that file's",
  "ASSUMPTION: <what and why>",
  "comment found by",
  "instead of calling",
  "contains one step whose",
  "contains a matching step with",
  "field with the source scenario's",
];

for (const fragment of PROSE_FRAGMENTS) {
  test(`isCheckable is false for the prose fragment "${fragment}"`, () => {
    const scenario = { title: "Prose fragment", intent: `the doc \`${fragment}\` verdict` };
    assert.equal(isCheckable(scenario), false);
  });
}

test("isCheckable is false when the first token is not a known executable, even with a space in the span", () => {
  const scenario = { title: "Unknown tool", intent: "`foobar --check` passes" };
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

test("ALLOWED_EXECUTABLES lists the tools this repo's own specs and docs would plausibly invoke", () => {
  for (const tool of ["npm", "npx", "node", "git", "openspec", "dod-guard", "grep", "findstr", "tsc", "biome"]) {
    assert.ok(ALLOWED_EXECUTABLES.has(tool), `expected ${tool} to be allowed`);
  }
});

test("isRunnable is true for a genuine command with an available tool", async () => {
  const scenario = { title: "Tests run clean", intent: "`npm test` exits zero" };
  assert.equal(await isRunnable(scenario, process.cwd()), true);
});

test("isRunnable is false for a prose fragment even though it holds a space", async () => {
  const scenario = { title: "Prose fragment", intent: "the doc `holds that file's` verdict" };
  assert.equal(await isRunnable(scenario, process.cwd()), false);
});
