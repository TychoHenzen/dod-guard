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
const githubDiscipline = await read("plugins/dod-guard/standards/github-request-discipline.md");
const readme = await read("plugins/dod-guard/README.md");
const usage = await read("plugins/dod-guard/USAGE.md");
const addBacklog = await read("plugins/dod-guard/skills/add-backlog-idea/SKILL.md");
const refine = await read("plugins/dod-guard/skills/refine-backlog-item/SKILL.md");
const nextTicket = await read("plugins/dod-guard/skills/next-ticket/SKILL.md");
const submit = await read("plugins/dod-guard/skills/submit-draft-pr/SKILL.md");
const setup = await read("plugins/dod-guard/skills/setup-repository/SKILL.md");
const githubSkills = [
  addBacklog,
  refine,
  nextTicket,
  submit,
  setup,
  await read("plugins/dod-guard/skills/review-pr/SKILL.md"),
  await read("plugins/dod-guard/skills/fix-pr-review/SKILL.md"),
  await read("plugins/dod-guard/skills/complete-pr/SKILL.md"),
  await read("plugins/dod-guard/skills/publish/SKILL.md"),
];

test("README and usage expose every structured stage contract", () => {
  const stages = [
    ["Principles", "`/setup-repository`", "Repository instructions", "Existing rules guide capture and refinement."],
    ["Problem", "`/add-backlog-idea`", "Issue in `Backlog` with concise outcome and scope", "Refine one coherent issue."],
    ["Requirements", "`/refine-backlog-item`", "Issue `Outcome`, `Scope`, and checked `Acceptance criteria`", "Clarify gaps, then plan."],
    ["Clarification", "`/refine-backlog-item`", "`Implementation notes` with decisions and discovery evidence", "Only resolved requirements enter the plan."],
    ["Plan", "`/refine-backlog-item`", "`implementation-plan` record in the issue", "Break the plan into actionable tasks."],
    ["Tasks", "`/refine-backlog-item`", "`task-list` record and independent linked sub-issues only when needed", "`Todo` PBI hands the task list to implementation."],
    ["Implementation handoff", "`/next-ticket`", "Issue task list, issue branch, commits, and verification evidence", "A pushed branch can enter draft-PR convergence."],
    ["Convergence", "`/submit-draft-pr`", "Draft PR `## Convergence` section and any actionable issue remainder", "Review and acceptance remain separate."],
  ];
  for (const [stage, owner, artifact, handoff] of stages) {
    for (const document of [readme, usage]) {
      assert.match(document, new RegExp(`\\| ${stage} \\| ${owner} \\| ${artifact} \\| ${handoff} \\|`));
    }
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
  assert.match(submit, /Map every task and linked sub-issue to applicable evidence/);
  assert.match(submit, /administrative sub-issue, map verified remote-state evidence/);
  assert.match(nextTicket, /resolve the active dod-guard plugin root/i);
  assert.match(refine, /resolve the active dod-guard plugin root/i);
  assert.match(submit, /resolve the active dod-guard plugin root/i);
});

test("convergence blocks incomplete work and leaves the small-fix bypass", () => {
  assert.match(
    standard,
    /An incomplete or contradicted result is not reported as complete/,
  );
  assert.match(
    submit,
    /implementation is incomplete or contradicted.*stop.*without creating or updating the draft PR/si,
  );
  assert.match(submit, /Small, clear fixes use the ordinary path/);
  assert.match(submit, /## Convergence/);
  assert.match(standard, /Before any\s+remainder write,\s+snapshot the issue body/);
  assert.match(submit, /snapshot the\s+issue body, task list, labels, links, Project item, and Status/);
  assert.match(submit, /After each successful mutation, read back\s+the changed state/);
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

test("every GitHub-facing skill shares the request discipline", () => {
  assert.match(githubDiscipline, /GitHub MCP connector/);
  assert.match(githubDiscipline, /reuses a run snapshot/);
  assert.match(githubDiscipline, /Project v2/);
  for (const skill of githubSkills) {
    assert.match(skill, /standards\/github-request-discipline\.md/);
  }
});
