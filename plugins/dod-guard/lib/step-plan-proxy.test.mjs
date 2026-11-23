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
    },
    { task: "T2", files: ["lib/b.mjs"], proxies: [], commit: "", errors: [] },
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
