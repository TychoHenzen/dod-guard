// The plan contract for haiku implementation (issue 944, reworked in issue 974),
// kept apart so structured-handoff.test.mjs stays within the file-size lint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const SKILL = new URL("../SKILL.md", import.meta.url);
const nextTicket = await readFile(SKILL, "utf8");

// A cheap worker follows a plan and never designs. `dod-guard:refine-backlog-item`
// writes one step plan per task, so next-ticket only saves the plan and
// dispatches it. Every task is dispatched, a one-task PBI included, and a
// missing plan stops the stage instead of being written here.
const PLAN_CONTRACT = [
  "Dispatch every task, including the single task of a one-task PBI, to " +
    "`dod-guard:stage-cheap` from the task's step plan, the `## Step plan: <task-id>` " +
    "comment that `dod-guard:refine-backlog-item` wrote on the issue.",
  "Before dispatching a task, save its step plan comment, unchanged, to a scratch file outside the repository.",
  'The brief is the one "Stage brief" in `standards/model-routing.md` defines',
  "its first line reads `Follow the step plan in <scratch file>.`",
  "This thread writes no step plan and decides no design question: the plan carries every design decision.",
  "Implementing the task from that plan uses the cheap tier on `dod-guard:stage-cheap`",
  "Edit tracked files for implementation on this thread only when your brief carries the failure record of an earlier cheap run of the same task",
  "When you run on `dod-guard:stage-cheap-skill` and a task fails that way, stop the stage and report the failure record to your dispatcher",
  "Each task report names its dispatch (agent, model, and effort)",
  "or the escalation record that explains an owner edit; a report with neither is a failed check.",
];

test("next-ticket dispatches the step plan that refinement wrote", () => {
  for (const phrase of PLAN_CONTRACT) {
    assert.match(nextTicket, prose(phrase), phrase);
  }
});

test("a missing step plan stops next-ticket and is never written there", () => {
  assert.match(nextTicket, prose("is the stop `step-plan-missing`: name the task, change nothing, and report"));
  assert.match(nextTicket, prose("Never write or complete a step plan yourself."));
  assert.doesNotMatch(nextTicket, prose("write its step plan to a scratch file"));
  assert.doesNotMatch(nextTicket, prose("Writing the plan uses the standard tier"));
});

test("next-ticket has no owner-edit escape hatch and the dispatch rule is unconditional", () => {
  assert.doesNotMatch(nextTicket, prose("You may apply a small exact edit yourself"));
  assert.doesNotMatch(nextTicket, prose("cannot be reduced to a written plan"));
  const flat = nextTicket.replace(/\s+/g, " ");
  const rule = flat.indexOf("Dispatch every task, including the single task");
  const multi = flat.indexOf("When the task list has more than one task");
  assert.ok(rule !== -1 && multi !== -1 && rule < multi, "the dispatch rule precedes the multi-task sentence");
});
