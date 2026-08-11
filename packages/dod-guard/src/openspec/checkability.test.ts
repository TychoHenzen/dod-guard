import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { extractCommand as ExtractCommand, isRunnable as IsRunnable } from "./checkability.js";

// `isCheckable`/`ALLOWED_EXECUTABLES` are internal; exercise layer 1
// through `isRunnable`, the real entry point, with the host mocked out.
let extractCommand: typeof ExtractCommand;
let isRunnable: typeof IsRunnable;

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string } | null) => void;

function fakeExecFile(...args: unknown[]): void {
  (args[3] as ExecFileCallback)(null, { stdout: "", stderr: "" });
}

before(async () => {
  const { mock } = await import("node:test");
  mock.module("node:child_process", { namedExports: { execFile: mock.fn(fakeExecFile) } });
  ({ extractCommand, isRunnable } = await import("./checkability.js"));
});

test("isRunnable is true when the intent names a command whose first token is a known, available executable", async () => {
  const scenario = { title: "Tests run clean", intent: "`npm test` exits zero" };
  assert.equal(await isRunnable(scenario, process.cwd()), true);
});

test("isRunnable is false for a bare single-word code span", async () => {
  const scenario = {
    title: "One scenario becomes one leaf",
    intent: "the generated DoD contains one leaf, with the scenario's `THEN` line as the leaf intent",
  };
  assert.equal(await isRunnable(scenario, process.cwd()), false);
});

test("isRunnable is false for plain prose with no code span at all", async () => {
  const scenario = { title: "Reviewer checks tone", intent: "the summary reads clearly and stays on topic" };
  assert.equal(await isRunnable(scenario, process.cwd()), false);
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
  test(`isRunnable is false for the prose fragment "${fragment}"`, async () => {
    const scenario = { title: "Prose fragment", intent: `the doc \`${fragment}\` verdict` };
    assert.equal(await isRunnable(scenario, process.cwd()), false);
  });
}

test("isRunnable is false when the first token is not a known executable, even with a space in the span", async () => {
  const scenario = { title: "Unknown tool", intent: "`foobar --check` passes" };
  assert.equal(await isRunnable(scenario, process.cwd()), false);
});

test("extractCommand strips the backticks off the first command-shaped span", () => {
  const scenario = { title: "Tests run clean", intent: "`npm test` exits zero" };
  assert.equal(extractCommand(scenario), "npm test");
});

test("extractCommand returns empty string when the scenario is not checkable", () => {
  const scenario = { title: "Reviewer checks tone", intent: "the summary reads clearly and stays on topic" };
  assert.equal(extractCommand(scenario), "");
});

test("isRunnable accepts every executable this repo's own specs and docs would plausibly invoke", async () => {
  for (const tool of ["npm", "npx", "node", "git", "openspec", "dod-guard", "grep", "findstr", "tsc", "biome"]) {
    const scenario = { title: tool, intent: `\`${tool} --version\` succeeds` };
    assert.equal(await isRunnable(scenario, process.cwd()), true, `expected ${tool} to be recognized and runnable`);
  }
});

test("isRunnable is false for a prose fragment even though it holds a space", async () => {
  const scenario = { title: "Prose fragment", intent: "the doc `holds that file's` verdict" };
  assert.equal(await isRunnable(scenario, process.cwd()), false);
});
