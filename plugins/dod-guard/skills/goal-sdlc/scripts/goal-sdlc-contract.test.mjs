import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "SKILL.md",
);

async function readSkill() {
  return readFile(skillPath, "utf8");
}

test("goal-sdlc retains every delivery stage and queue boundary", async () => {
  const skill = await readSkill();
  for (const marker of [
    "CHECKOUT AND EXECUTION POLICY",
    "CONTINUOUS QUEUE LOOP",
    "STATE SNAPSHOT AND READ DISCIPLINE",
    "1\\. Reconcile live state",
    "2\\. Choose one current delivery unit",
    "3\\. Refinement contract",
    "4\\. Implementation and branch rules",
    "5\\. Goal-directed validation cadence",
    "6\\. PR, review, remediation, and completion",
    "7\\. Blocker triage and proactive recovery",
    "8\\. Quality Guard and cache changes",
    "9\\. Common-sense completion and continuation",
    "After every successful merge:",
  ]) {
    assert.ok(skill.includes(marker), `missing workflow marker: ${marker}`);
  }
  assert.match(skill, /Process exactly one parent PBI\/delivery unit at a time/);
  assert.match(skill, /Do not mark the goal complete after one PBI/);
});

test("goal-sdlc keeps built-in goal ownership and delegated execution explicit", async () => {
  const skill = await readSkill();
  assert.match(skill, /supporting skill for built-in `\/goal` runs/);
  assert.match(skill, /does not implement,\nreplace, or claim the built-in `\/goal` command/);
  assert.match(skill, /Dispatch at least one fresh subagent/);
  assert.match(skill, /main thread is the high-level orchestrator/);
  assert.match(skill, /never create, use, register, switch to, prune, remove, or clean up a Git\s+worktree/);
  assert.match(skill, /\[\$dod-guard:next-ticket\]\(\.\.\/next-ticket\/SKILL\.md\)/);
  assert.doesNotMatch(skill, /5\.4\.5|plugins[\\/]cache[\\/]dod-guard-monorepo/);
});

test("goal-sdlc retains failure checkpoints and completion gates", async () => {
  const skill = await readSkill();
  for (const marker of [
    "reviewAttempted=true",
    "current head",
    "all finding comments were marked as resolved",
    "Retry the same exact transient failure at most once",
    "Preserve the checkpoint on failure or interruption; repair the same step",
    "Invoke `[$dod-guard:complete-pr](../complete-pr/SKILL.md)` for the guarded",
    "Do not write parent, child, branch, or worktree state from this queue skill.",
    "Read back all parent and child statuses after the completion owner returns.",
    "this queue skill never sweeps unrelated refs",
    "Project Done",
  ]) {
    assert.ok(skill.includes(marker), `missing reliability marker: ${marker}`);
  }
  assert.doesNotMatch(
    skill,
    /delete both the local and the remote copy of both the merged branch as well as/,
  );
});
