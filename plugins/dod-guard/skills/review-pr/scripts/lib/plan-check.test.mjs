// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { checkPlan } from "./plan-check.mjs";

const SLOTS = [
  { slot: "file:src/a.mjs", kind: "file" },
  { slot: "criterion:1", kind: "criterion", text: "AC-01 first" },
];
const ask = (id, lens) => ({ id, lens, question: `Does ${lens} hold?`, files: ["src/a.mjs"] });
const PLAN = [
  { slot: "file:src/a.mjs", questions: [ask("F1", "review-pr-feature"), ask("D1", "review-pr-design")] },
  { slot: "criterion:1", questions: [ask("R1", "review-pr-reliability"), ask("H1", "review-pr-hygiene")] },
];

function withFiles(plan, body) {
  const dir = mkdtempSync(join(tmpdir(), "plan-check-"));
  try {
    const put = (name, value) => {
      const path = join(dir, name);
      writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
      return path;
    };
    const args = {
      slots: put("slots.json", SLOTS),
      violations: put("violations.json", []),
      plan: put("plan.json", plan),
    };
    return body({ dir, args, put });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("accepts a planner answer without status fields and prints counts", () => {
  withFiles(PLAN, ({ args }) => {
    assert.deepEqual(checkPlan(args), { slots: 2, questions: 4, exclusions: 0 });
  });
});

test("names the limit when a slot has three questions", () => {
  const crowded = [{ ...PLAN[0], questions: [...PLAN[0].questions, ask("F3", "review-pr-feature")] }, PLAN[1]];
  withFiles(crowded, ({ args }) => {
    assert.throws(() => checkPlan(args), /Slot file:src\/a\.mjs has 3 questions; the limit is 2/);
  });
});

test("names the file when the plan file is not JSON", () => {
  withFiles(PLAN, ({ args, put }) => {
    const plan = put("plan.json", "{not json");
    assert.throws(() => checkPlan({ ...args, plan }), /Cannot read JSON from .*plan/);
  });
});

test("names a missing slot", () => {
  withFiles(PLAN.slice(0, 1), ({ args }) => {
    assert.throws(() => checkPlan(args), /Slots missing from the plan/);
  });
});

test("names an empty files list", () => {
  const empty = [{ ...PLAN[0], questions: [{ ...ask("F1", "review-pr-feature"), files: [] }] }, PLAN[1]];
  withFiles(empty, ({ args }) => {
    assert.throws(() => checkPlan(args), /needs an id, a reviewer lens, a question, a files list/);
  });
});

test("a corrected plan passes after a refused one", () => {
  const crowded = [{ ...PLAN[0], questions: [...PLAN[0].questions, ask("F3", "review-pr-feature")] }, PLAN[1]];
  withFiles(crowded, ({ dir, args, put }) => {
    assert.throws(() => checkPlan(args), /the limit is 2/);
    put("plan.json", PLAN);
    assert.deepEqual(checkPlan(args), { slots: 2, questions: 4, exclusions: 0 });
    assert.deepEqual(readdirSync(dir).sort(), ["plan.json", "slots.json", "violations.json"]);
  });
});
