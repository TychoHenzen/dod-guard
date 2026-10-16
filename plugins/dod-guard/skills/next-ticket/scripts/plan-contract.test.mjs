// The plan contract for haiku implementation (issue 944), kept apart so
// structured-handoff.test.mjs stays within the file-size lint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const SKILL = new URL("../SKILL.md", import.meta.url);
const nextTicket = await readFile(SKILL, "utf8");

// A cheap worker follows a plan and never designs, so the owner writes the
// plan before the dispatch. Every task is dispatched, a one-task PBI included,
// and the owner edits tracked files only after the task escalated.
const PLAN_CONTRACT = [
  "Before dispatching a task, write its step plan to a scratch file",
  "outside the repository",
  "Use fenced code blocks only",
  "Dispatch every task, including the single task of a one-task PBI, to `dod-guard:stage-cheap` from a step plan you wrote.",
  "Writing the plan uses the standard tier, and the plan carries every design decision.",
  "Implementing the task from that plan uses the cheap tier on `dod-guard:stage-cheap`",
  "Edit tracked files for implementation on this thread only after the task escalated:",
  "the cheap model failed its check twice",
  "Each task report names its dispatch (agent, model, and effort)",
  "or the escalation record that explains an owner edit; a report with neither is a failed check.",
];

test("next-ticket writes a step plan before a cheap dispatch", () => {
  for (const phrase of PLAN_CONTRACT) {
    assert.match(nextTicket, prose(phrase), phrase);
  }
});

test("next-ticket has no owner-edit escape hatch and the dispatch rule is unconditional", () => {
  assert.doesNotMatch(nextTicket, prose("You may apply a small exact edit yourself"));
  assert.doesNotMatch(nextTicket, prose("cannot be reduced to a written plan"));
  const flat = nextTicket.replace(/\s+/g, " ");
  const rule = flat.indexOf("Dispatch every task, including the single task");
  const multi = flat.indexOf("When the task list has more than one task");
  assert.ok(rule !== -1 && multi !== -1 && rule < multi, "the dispatch rule precedes the multi-task sentence");
});
