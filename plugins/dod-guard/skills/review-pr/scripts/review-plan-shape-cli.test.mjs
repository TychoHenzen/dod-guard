// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { existsSync, readdirSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { HEAD, PLAN } from "./lib/review-findings-build.test-support.mjs";
import { run, withDir, write } from "./lib/review-findings-cli.test-support.mjs";

const EXCLUSION_REFUSED = /The exclusion for slot file:src\/a\.mjs needs a reviewer lens and a reason/;
const QUESTION_REFUSED = /Question "F1" in slot file:src\/a\.mjs needs an id, a reviewer lens/;
const STATUS_REFUSED = /and a status of verified, repaired, unanswered/;

// The planner has not saved statuses when it cuts batches.
const draft = (questions) => questions.map(({ status: _status, ...rest }) => rest);
const unsaved = PLAN.map((entry) => ({ ...entry, questions: draft(entry.questions) }));
const prefixed = (plan, prefix) =>
  plan.map((entry) => ({ ...entry, questions: entry.questions.map((q) => ({ ...q, lens: `${prefix}${q.lens}` })) }));

function cut(dir, plan) {
  const out = join(dir, "batches");
  const result = run(["batches", `--plan=${write(dir, "plan.json", plan)}`, `--head=${HEAD}`, `--out-dir=${out}`]);
  return { result, out };
}

test("batches accepts dod-guard: lenses and a plan with no saved statuses", () => {
  withDir((dir) => {
    const { result, out } = cut(dir, prefixed(unsaved, "dod-guard:"));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readdirSync(out).length > 0);
  });
});

test("batches refuses an exclusion written as an array before it writes any batch", () => {
  withDir((dir) => {
    const excluded = [{ lens: "review-pr-feature", reason: "Generated file" }];
    const { result, out } = cut(dir, [{ slot: "file:src/a.mjs", excluded }, ...unsaved.slice(1)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, EXCLUSION_REFUSED);
    assert.equal(existsSync(out), false);
  });
});

test("batches refuses a lens with another prefix and names the question", () => {
  withDir((dir) => {
    const { result, out } = cut(dir, prefixed(unsaved, "other:"));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, QUESTION_REFUSED);
    assert.equal(existsSync(out), false);
  });
});

test("batches refuses a status that is saved but not one of the three", () => {
  withDir((dir) => {
    const bogus = PLAN.map((entry) => ({
      ...entry,
      questions: entry.questions.map((q) => ({ ...q, status: "done" })),
    }));
    const { result } = cut(dir, bogus);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, STATUS_REFUSED);
  });
});
