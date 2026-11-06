// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { existsSync, readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { planHash } from "./lib/plan-hash.mjs";
import { buildArgs, buildFlags, HEAD, PLAN } from "./lib/review-findings-build.test-support.mjs";
import { run, withDir, write } from "./lib/review-findings-cli.test-support.mjs";

// The planner copies the Agent tool's name for a reviewer, `dod-guard:review-pr-feature`, into `lens`.
function relabel(prefix) {
  const prefixed = (question) => ({ ...question, lens: `${prefix}${question.lens}` });
  return PLAN.map((entry) => ({ ...entry, questions: entry.questions.map(prefixed) }));
}

function withPlan(dir, plan) {
  const base = buildFlags(dir);
  const answers = write(dir, "answers.json", { planHash: planHash(plan), headSha: HEAD, answers: [] });
  return { ...base, plan: write(dir, "plan.json", plan), answers };
}

test("build posts a plan whose lenses carry the dod-guard: prefix and lists the bare lens names", () => {
  withDir((dir) => {
    const paths = withPlan(dir, relabel("dod-guard:"));
    const result = run(["build", ...buildArgs(paths)]);
    assert.equal(result.status, 0, result.stderr);
    const { body } = JSON.parse(readFileSync(paths.out, "utf8"));
    assert.ok(body.includes("- F1 review-pr-feature (verified): Does review-pr-feature hold?"), body);
    assert.equal(body.includes("- F1 dod-guard:"), false);
  });
});

test("build still refuses a lens with another prefix and writes no payload", () => {
  withDir((dir) => {
    const paths = withPlan(dir, relabel("other:"));
    const result = run(["build", ...buildArgs(paths)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /needs an id, a reviewer lens, a question, a files list/);
    assert.equal(existsSync(paths.out), false);
  });
});
