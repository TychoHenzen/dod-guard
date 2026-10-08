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
];

test("goal-sdlc links every lifecycle owner by relative path", () => {
  for (const name of OWNERS) {
    assert.ok(skill.includes(`[dod-guard:${name}](../${name}/SKILL.md)`), `missing owner link: ${name}`);
  }
  assert.match(skill, prose("when this file and an owning skill differ, the owning skill wins"));
  assert.match(skill, prose("It never writes issue, Project, branch, or pull request state itself."));
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
  assert.ok(skill.split("\n").length <= 160, "goal-sdlc grew past an orchestrator");
  // Rules that belong to an owner must not come back here.
  for (const owned of ["## Acceptance matrix", "Review lenses", "pre-review checkpoint", "validation cadence"]) {
    assert.ok(!skill.includes(owned), `restates an owned rule: ${owned}`);
  }
});

test("goal-sdlc selects through the read-only queue selector", () => {
  assert.match(skill, prose("node scripts/select-next.mjs --snapshot=<file>"));
  assert.match(skill, prose("Todo before Backlog, then Project order"));
  assert.match(skill, prose("Process exactly one parent at a time, in the current checkout"));
  assert.match(skill, prose("Never create or use a Git worktree."));
});

test("goal-sdlc delegates to bounded subagents, not user-visible threads", () => {
  assert.match(skill, prose("bounded subagents do the context-heavy work"));
  for (const marker of ["create_thread", "fork_thread", "send_message_to_thread", "codex://threads/...", "100,000 tokens"]) {
    assert.ok(skill.includes(marker), `missing delegation marker: ${marker}`);
  }
  assert.match(skill, prose("do not create a lock file or local ledger"));
});

test("goal-sdlc keeps one daily friction log and a strict stop condition", () => {
  assert.match(skill, prose("titled exactly `Friction log YYYY-MM-DD`"));
  assert.match(skill, prose("The queue holds today's log while it collects entries"));
  assert.match(skill, prose("`[HH:MM]`", "`PBIs completed: N`"));
  assert.match(skill, prose("starts", "with `Blocked:`"));
  assert.match(skill, prose("An empty Todo column with a non-empty Backlog is not", "an empty queue"));
  assert.match(skill, prose("three", "evidence-backed attempts"));
});
