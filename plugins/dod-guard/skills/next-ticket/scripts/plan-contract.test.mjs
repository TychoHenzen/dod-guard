// The plan contract for haiku implementation (issue 944), kept apart so
// structured-handoff.test.mjs stays within the file-size lint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const SKILL = new URL("../SKILL.md", import.meta.url);
const nextTicket = await readFile(SKILL, "utf8");

// A cheap worker follows a plan and never designs, so the owner writes the
// plan before the dispatch, and a task with no writable plan stays with the
// owner's standard-tier thread.
const PLAN_CONTRACT = [
  "Before dispatching a task, write its step plan to a scratch file",
  "outside the repository",
  "Use fenced code blocks only",
  "Implementing the task from that plan uses the cheap tier",
  "Writing the plan uses the standard tier",
  "so does implementing a task that cannot be reduced to a written plan",
  "You may apply a small exact edit yourself instead of dispatching it.",
];

test("next-ticket writes a step plan before a cheap dispatch", () => {
  for (const phrase of PLAN_CONTRACT) {
    assert.match(nextTicket, prose(phrase), phrase);
  }
});
