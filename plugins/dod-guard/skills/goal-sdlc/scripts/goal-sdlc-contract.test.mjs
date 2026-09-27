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
  assert.match(
    skill,
    /target project: the single open GitHub Project explicitly linked to the current repository/,
  );
  assert.doesNotMatch(
    skill,
    /target project: https?:\/\//,
  );
});

test("goal-sdlc keeps built-in goal ownership and delegated execution explicit", async () => {
  const skill = await readSkill();
  assert.match(skill, /supporting skill for built-in `\/goal` runs/);
  assert.match(skill, /does not implement,\nreplace, or claim the built-in `\/goal` command/);
  assert.match(skill, /Dispatch at least one fresh subagent/);
  assert.match(skill, /Context-heavy execution belongs in the bounded subagent/);
  assert.match(skill, /\[HH:MM\]/);
  assert.match(skill, /PBIs completed: N/);
  assert.match(skill, /main thread is the high-level orchestrator/);
  assert.match(skill, /never create, use, register, switch to, prune, remove, or clean up a Git\s+worktree/);
  assert.match(skill, /\[\$dod-guard:next-ticket\]\(\.\.\/next-ticket\/SKILL\.md\)/);
  assert.ok(
    skill.includes(
      "The shipped `[$dod-guard:review-pr](../review-pr/SKILL.md)` skill owns the\n" +
        "single PR review for this plugin.",
    ),
  );
  assert.doesNotMatch(skill, /review-pr-branch/);
  assert.doesNotMatch(skill, /5\.4\.5|plugins[\\/]cache[\\/]dod-guard-monorepo/);
});

test("goal-sdlc retains failure checkpoints and completion gates", async () => {
  const skill = await readSkill();
  for (const marker of [
    "remote PR review state",
    "Do not create or consult a local review ledger",
    "current head",
    "all finding comments were marked as resolved",
    "Retry the same exact transient failure at most once",
    "Preserve the checkpoint on failure or interruption; repair the same step",
    "Then use:",
    "Do not write parent, child, branch, or worktree state from this queue skill.",
    "Read back all parent and child statuses after the completion owner returns.",
    "this queue skill never sweeps unrelated refs",
    "Project Done",
    "newly added test or fixture is included by the configured test glob",
    "producer's required working directory",
    "one wait owner",
  ]) {
    assert.ok(skill.includes(marker), `missing reliability marker: ${marker}`);
  }
  assert.doesNotMatch(
    skill,
    /delete both the local and the remote copy of both the merged branch as well as/,
  );
  assert.match(
    skill,
    /Do not invoke `\[\$dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)` again after\s+merge; the preceding invocation owns the guarded\s+merge, branch cleanup, and\s+Project finalization pass\./,
  );
  assert.match(
    skill,
    /Then use:\s+&#x20; \[\$dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)/,
  );
  assert.doesNotMatch(
    skill,
    /After merge:\s+- Invoke `\[\$dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)` for the guarded/,
  );
});

test("goal-sdlc makes blocked stops brief and plain-language", async () => {
  const skill = await readSkill();
  for (const marker of [
    "Blocked-state user-facing response:",
    "one brief user-facing message",
    "Assume the user has zero prior context",
    "Start with `Blocked:`",
    "one-sentence purpose",
    "at most five bullets",
    "Translate workflow jargon",
    "If another eligible delivery unit can proceed",
    "one concrete question",
  ]) {
    assert.ok(skill.includes(marker), `missing blocked-response marker: ${marker}`);
  }
  assert.match(skill, /Do not narrate checkpoint, snapshot, delegation, queue, or audit mechanics/);
});

test("goal-sdlc does not promote arbitrary project documents to workflow authority", async () => {
  const skill = await readSkill();
  assert.match(skill, /Do not infer workflow authority from files merely present in the repository/);
  assert.match(skill, /Read a project-local process document only when the user explicitly names it/);
  assert.match(skill, /resolve the skill by name\s+under the active plugin root instead of substituting a local process document/);
  assert.doesNotMatch(skill, /Automation\.md|review-checkpoints|\.beehaiive/);
});

test("goal-sdlc resumes dirty work and tracks an unmatched task", async () => {
  const skill = await readSkill();
  assert.match(skill, /dirty current checkout as evidence that a task is probably already in progress/);
  assert.match(skill, /preserve the edits and resume that task from its latest safe checkpoint/);
  assert.match(skill, /If dirty work or an in-progress branch cannot be matched to an existing PBI, create one/);
  assert.match(skill, /Do not discard, reset, stash, overwrite, or silently absorb those edits/);
  assert.match(skill, /queue-empty result only after checking for dirty or in-progress work/);
});
