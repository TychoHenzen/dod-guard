import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

// goal-sdlc only sequences the lifecycle skills, so these tests pin the loop
// and the owner links. The owning skills' own tests pin their rules.
const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

const OWNERS = [
  "refine-backlog-item",
  "next-ticket",
  "submit-draft-pr",
  "review-pr",
  "fix-pr-review",
  "complete-pr",
  "add-backlog-idea",
  "quick-pbi",
  "step-by-step",
];

test("goal-sdlc links every lifecycle owner by relative path", () => {
  for (const name of OWNERS) {
    assert.ok(
      skill.includes(`[dod-guard:${name}](../${name}/SKILL.md)`),
      `missing owner link: ${name}`,
    );
  }
  assert.match(
    skill,
    prose("when this file and an owning skill differ, the owning skill wins"),
  );
  assert.match(
    skill,
    prose(
      "It never writes issue, Project, branch, or pull request state itself.",
    ),
  );
});

test("goal-sdlc keeps its sections short and its own", () => {
  const headings = skill.match(/^##+ .+$/gm);
  assert.deepEqual(headings, [
    "## Owners",
    "## Loop",
    "## Delegation",
    "## Blockers",
    "## Friction log",
    "## Reporting",
    "## Stop condition",
  ]);
  assert.ok(
    skill.split("\n").length <= 160,
    "goal-sdlc grew past an orchestrator",
  );
  // Rules that belong to an owner must not come back here.
  for (const owned of [
    "## Acceptance matrix",
    "Review lenses",
    "pre-review checkpoint",
    "validation cadence",
    "Record a compact checkpoint",
    "The strong tier is for",
    "The cheap tier is for",
  ]) {
    assert.ok(!skill.includes(owned), `restates an owned rule: ${owned}`);
  }
});

test("goal-sdlc selects through the read-only queue selector", () => {
  assert.match(skill, prose("node scripts/select-next.mjs --snapshot=<file>"));
  assert.match(skill, prose("In Progress parents first"));
  assert.match(skill, prose("then Todo, then Backlog, each in Project order"));
  assert.match(
    skill,
    prose("Process exactly one parent at a time, in the current checkout"),
  );
  assert.match(skill, prose("Never create or use a Git worktree."));
});

test("goal-sdlc delegates to subagents, not user-visible threads", () => {
  assert.match(skill, prose("bounded subagents do the context-heavy work"));
  for (const marker of [
    "create_thread",
    "fork_thread",
    "send_message_to_thread",
    "codex://threads/...",
    "100,000 tokens",
  ]) {
    assert.ok(skill.includes(marker), `missing delegation marker: ${marker}`);
  }
  assert.match(skill, prose("do not create a lock file or local ledger"));
});

test("goal-sdlc keeps one daily friction log and a strict stop", () => {
  assert.match(skill, prose("titled exactly `Friction log YYYY-MM-DD`"));
  assert.match(
    skill,
    prose("The queue holds today's log while it collects entries"),
  );
  assert.match(skill, prose("`[HH:MM]`", "`PBIs completed: N`"));
  assert.match(skill, prose("starts", "with `Blocked:`"));
  assert.match(
    skill,
    prose(
      "An empty Todo column with a non-empty Backlog is not",
      "an empty queue",
    ),
  );
  assert.match(skill, prose("three", "evidence-backed attempts"));
});

const ROUTES = [
  ["Queue snapshot read", "cheap"],
  ["Refinement: plan research questions, then decide classification and criteria", "strong"],
  ["Refinement: investigate code, callers, and tests", "cheap"],
  ["`/next-ticket`: implement one task", "strong"],
  ["`/next-ticket`: run validations and regenerate artifacts", "cheap"],
  ["`/submit-draft-pr`", "strong"],
  ["`/review-pr`: plan and judge", "strong"],
  ["`/review-pr`: investigate", "cheap"],
  ["`/fix-pr-review`", "strong"],
  ["`/complete-pr`: guarded merge and Project finalization", "strong"],
  ["`/add-backlog-idea`, including the friction log", "strong"],
];
const EFFORT = { strong: "`medium`", cheap: "`max`" };

function routingRows(text) {
  const start = text.indexOf("| Stage | Tier | Effort |");
  const end = text.indexOf("\n\n", start);
  return text
    .slice(start, end)
    .split("\n")
    .slice(2)
    .map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
}

test("goal-sdlc routes every stage to one tier with an explicit effort", () => {
  const rows = routingRows(skill);
  assert.deepEqual(
    rows,
    [
      ...ROUTES.map(([stage, tier]) => [stage, tier, EFFORT[tier]]),
      ["Merge conflict", "none", "stop and report, as `/complete-pr` says"],
    ],
  );
  assert.match(skill, prose("Each stage runs in one fresh subagent as one step of"));
  assert.match(skill, prose("Dispatch each row as `standards/model-routing.md` says"));
  assert.match(skill, prose("pass its model and effort to the Agent call in Claude Code"));
  assert.match(skill, prose("or use the registered tier agent in Codex"));
  assert.match(skill, prose("name the stage, tier, model, and effort in the progress message"));
  assert.match(skill, prose("A model or effort the user names for a stage wins for that run and is recorded there."));
  assert.match(skill, prose("Verify cheap-tier output before anything relies on it"));
  assert.match(
    skill,
    prose("read back the commit of any stage that changed tracked files before the next stage starts"),
  );
});
