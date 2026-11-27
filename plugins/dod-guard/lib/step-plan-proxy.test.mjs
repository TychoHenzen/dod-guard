import assert from "node:assert/strict";
import test from "node:test";
import { parseStepPlans } from "./step-plan-parse.mjs";
import { proxyRemainder } from "./step-plan-proxy.mjs";

const withResult = (plan, result) => ({ ...plan, proxies: plan.proxies.map((proxy) => ({ ...proxy, result })) });

test("parses the task id, File lines, and proxy checks of each step plan heading", () => {
  const text = [
    "## Step plan: T1",
    "",
    "Commit: refactor: move a (#1)",
    "```text",
    "File: .\\lib\\a.mjs (created by this step)",
    "Proxy check: alpha|beta in ./lib",
    "```",
    "## Step plan: T2",
    "File: lib/b.mjs",
    "",
  ].join("\r\n");

  assert.deepEqual(parseStepPlans(text), [
    {
      task: "T1",
      files: ["lib/a.mjs"],
      proxies: [{ pattern: "alpha|beta", scope: "lib" }],
      commit: "refactor: move a (#1)",
      errors: [],
      size: 133,
    },
    { task: "T2", files: ["lib/b.mjs"], proxies: [], commit: "", errors: [], size: 33 },
  ]);
  assert.deepEqual(parseStepPlans("File: stray.mjs\nno heading here"), []);
});

test("records a fenced git add, commit, or push as a plan error, and ignores prose that names one", () => {
  const text = [
    "## Step plan: T1",
    "Commit: docs: say where the loaders live (#4)",
    "The workflow runs git commit for you once the step passes.",
    "```bash",
    "git -C repo add CLAUDE.md",
    'git commit -m "docs: say where the loaders live (#4)"',
    "git status --porcelain",
    "```",
    "Then git push happens outside the plan.",
  ].join("\n");

  assert.deepEqual(parseStepPlans(text)[0].errors, [
    "step plan T1 runs git add; the worker never commits, so drop the step and put the message on " +
      "the plan's Commit line: git -C repo add CLAUDE.md",
    "step plan T1 runs git commit; the worker never commits, so drop the step and put the message on " +
      'the plan\'s Commit line: git commit -m "docs: say where the loaders live (#4)"',
  ]);
});

test("reports git only where a shell fence runs it, after a separator, and reads Commit outside fences", () => {
  const text = [
    "## Step plan: T1",
    "Commit: test: cover the git-write check (#5)",
    "```js",
    'assert.match(errors[0], /runs git commit/); // fixture: "git commit -m test"',
    "Commit: not the subject, a fixture line",
    "```",
    "```bash",
    'echo "Test: the parser reports git commit -m test"',
    "cd repo && git push origin HEAD",
    "```",
  ].join("\n");
  const [plan] = parseStepPlans(text);

  assert.equal(plan.commit, "test: cover the git-write check (#5)");
  assert.deepEqual(plan.errors, [
    "step plan T1 runs git push; the worker never commits, so drop the step and put the message on " +
      "the plan's Commit line: cd repo && git push origin HEAD",
  ]);
});

// A plan that copied a whole file or script in is the 46542-character comment
// the cap exists for; the proof names the size so the refiner posts a new one.
test("reports a plan over the step-plan cap and passes one at it", () => {
  const plan = (task, size) => {
    const head = `## Step plan: ${task}
File: a.mjs
Commit: fix: a (#1)
`;
    return head + "x".repeat(size - head.length);
  };
  const plans = parseStepPlans(`${plan("T1", 6000)}\n${plan("T2", 6001)}`);
  assert.deepEqual(
    plans.map(({ size }) => size),
    [6000, 6001],
  );
  assert.deepEqual(proxyRemainder(plans), [
    "step plan T2 is 6001 characters, over the 6000-character cap for stepPlan; " +
      "post a shorter plan that gives code only as a signature, an assertion, or a short change",
  ]);
});

test("reports a plan with a missing, empty, or repeated Commit line", () => {
  const plans = parseStepPlans(
    "## Step plan: T1\nFile: a.mjs\n## Step plan: T2\nFile: b.mjs\nCommit:\n" +
      "## Step plan: T3\nFile: c.mjs\nCommit: fix: one\nCommit: fix: two\n",
  );

  assert.deepEqual(proxyRemainder(plans), [
    "step plan T1 has no 'Commit: <subject>' line",
    "step plan T2 has no 'Commit: <subject>' line",
    "step plan T3 has more than one Commit line",
  ]);
});

test("records a malformed proxy check line and an invalid pattern as plan errors", () => {
  const text = "## Step plan: T1\nFile: a.mjs\nProxy check: alpha\nProxy check: ( in lib\n";

  assert.deepEqual(parseStepPlans(text)[0].errors, [
    "step plan T1 has a malformed proxy check line: Proxy check: alpha",
    "step plan T1 proxy check pattern is not a valid regular expression: (",
  ]);
});

test("reports each proxy hit that no File line names, and nothing for a named hit", () => {
  const [plan] = parseStepPlans("## Step plan: T1\nCommit: fix: a\nFile: lib/a.mjs\nProxy check: alpha in lib\n");
  const hit = (hits) => proxyRemainder([withResult(plan, { searched: 3, hits })]);

  assert.deepEqual(hit(["lib/a.mjs"]), []);
  assert.deepEqual(hit(["lib/a.mjs", "lib/b.mjs"]), [
    'step plan T1 proxy check "alpha" in lib hits lib/b.mjs, which no File line names',
  ]);
});

test("reports a task id that appears in two step plan comments", () => {
  const text = "## Step plan: T1\nCommit: fix: a\nFile: a.mjs\n## Step plan: T1\nCommit: fix: b\nFile: b.mjs\n";

  assert.deepEqual(proxyRemainder(parseStepPlans(text)), [
    "step plan T1 appears more than once; keep only its newest accepted comment",
  ]);
});

test("reports a proxy check that searched no file and a plan with no File line", () => {
  const [plan] = parseStepPlans("## Step plan: T1\nCommit: fix: a\nProxy check: alpha in lib\n");

  assert.deepEqual(proxyRemainder([withResult(plan, { searched: 0, hits: [] })]), [
    "step plan T1 has no File line",
    'step plan T1 proxy check "alpha" in lib searched no file',
  ]);
});
