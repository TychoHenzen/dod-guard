import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const read = (file) => readFile(path.join(root, file), "utf8");
const standard = await read("plugins/dod-guard/standards/project-workflow.md");
const readme = await read("plugins/dod-guard/README.md");
const usage = await read("plugins/dod-guard/USAGE.md");
const addBacklog = await read("plugins/dod-guard/skills/add-backlog-idea/SKILL.md");
const refine = await read("plugins/dod-guard/skills/refine-backlog-item/SKILL.md");
const nextTicket = await read("plugins/dod-guard/skills/next-ticket/SKILL.md");
const submit = await read("plugins/dod-guard/skills/submit-draft-pr/SKILL.md");
const setup = await read("plugins/dod-guard/skills/setup-repository/SKILL.md");

test("README and usage expose the same structured stage owners", () => {
  for (const stage of [
    "Principles",
    "Problem",
    "Requirements",
    "Clarification",
    "Plan",
    "Tasks",
    "Implementation handoff",
    "Convergence",
  ]) {
    assert.match(standard, new RegExp(`\\| ${stage}`));
  }
  assert.match(readme, /standards\/project-workflow\.md/);
  assert.match(usage, /standards\/project-workflow\.md/);
  assert.match(readme, /ordinary path for a small, clear fix/);
  assert.match(usage, /ordinary path for a small, clear fix/);
});

test("owners preserve the structured handoffs without a parallel planner", () => {
  assert.match(addBacklog, /outcome and scope are the problem\s+handoff/);
  assert.match(setup, /project-\s*principles source/);
  for (const marker of [
    "requirements",
    "clarifications",
    "implementation-plan",
    "task-list",
  ]) {
    assert.match(refine, new RegExp(`\`${marker}\``));
  }
  assert.match(nextTicket, /records as the implementation handoff/);
  assert.match(nextTicket, /Do not create a tracked\s+planning file/);
  assert.match(submit, /Converge structured work/);
  assert.match(submit, /Map every task and linked sub-issue to branch evidence/);
});

test("convergence blocks incomplete work and leaves the small-fix bypass", () => {
  assert.match(
    standard,
    /An incomplete or contradicted result is not reported as complete/,
  );
  assert.match(
    submit,
    /incomplete or contradicted, leave an actionable remainder.*stop without creating or updating the draft PR/s,
  );
  assert.match(submit, /Small, clear fixes use the ordinary path/);
  assert.match(submit, /## Convergence/);
});

test("structured work retains safety stops and historical OpenSpec boundaries", () => {
  for (const marker of [
    /credentials/,
    /destructive or authority-bound/,
    /unrelated work/,
    /provider or head\s+mismatch/,
    /missing high-risk\s+evidence/,
  ]) {
    assert.match(standard, marker);
    assert.match(nextTicket, marker);
  }
  assert.match(standard, /OpenSpec material is historical reference only/);
  assert.match(standard, /PBI #59 owns forgiving defaults/);
  assert.match(usage, /OpenSpec is historical reference material only/);
  assert.match(usage, /not an active runtime or/);
});
