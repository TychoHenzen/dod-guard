import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillPath = join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md");

async function readSkill() {
  return readFile(skillPath, "utf8");
}

test("goal-sdlc keeps built-in goal ownership and delegated execution explicit", async () => {
  const skill = await readSkill();
  assert.match(skill, /supporting skill for built-in `\/goal` runs/);
  assert.match(skill, /does not implement,\nreplace, or claim the built-in `\/goal` command/);
  assert.match(skill, /Dispatch at least one fresh subagent/);
  assert.match(skill, /Context-heavy execution belongs in the bounded subagent/);
  assert.match(skill, /\[HH:MM\]/);
  assert.match(skill, /PBIs completed: N/);
  assert.match(skill, /main thread is the high-level orchestrator/);
  assert.match(
    skill,
    /Git worktrees are prohibited: do not create, use, register, switch to, prune, remove, or clean them up/,
  );
  assert.match(skill, /\[dod-guard:next-ticket\]\(\.\.\/next-ticket\/SKILL\.md\)/);
  assert.match(skill, /`\/review-pr` scans the changed files, runs its reviewer agents, and is the one\s+code review/);
  assert.doesNotMatch(skill, /@codex review|Codex's automatic/);
  assert.match(skill, /Leave the PR a draft\. `complete-pr` owns the ready transition/);
  assert.doesNotMatch(skill, /draft=false|published\/non-draft/);
  assert.match(skill, /\[dod-guard:fix-pr-review\]\(\.\.\/fix-pr-review\/SKILL\.md\)/);
  assert.match(skill, /\[dod-guard:review-pr\]\(\.\.\/review-pr\/SKILL\.md\)/);
  assert.doesNotMatch(skill, /Review policy:/);
  assert.doesNotMatch(skill, /completed reviewer recommendation|review slot|reviewer-specific timeout/);
  assert.doesNotMatch(skill, /review-pr-branch/);
  assert.doesNotMatch(skill, /5\.4\.5|plugins[\\/]cache[\\/]dod-guard-monorepo/);
});

test("goal-sdlc serializes shared-checkout ownership in the existing handoff", async () => {
  const skill = await readSkill();
  for (const marker of [
    "## Shared-checkout ownership handshake",
    "active peer\ngoal or agent runs",
    "one canonical owner record",
    "parent and child PBI",
    "exact branch ref and observed commit SHA",
    "logical scope",
    "volatile evidence",
    "wait/no-mutation result",
    "stale conflicting evidence",
    "alone or alongside an exact peer",
    "peer that appears between the",
    "The waiting run's mutation list is\nempty",
    "read it back, and dispatch only after that exact identity is stable",
    "A peer write, branch movement, changed handoff, or head mismatch\ninvalidates the old owner evidence",
    "stale same-scope peers",
    "fail closed with an actionable recovery owner",
  ]) {
    assert.ok(skill.includes(marker), `missing ownership marker: ${marker}`);
  }
  assert.match(skill, /Do not create a lock file, local coordination ledger, hidden ref/);
  assert.match(skill, /Do not dispatch, switch or\nedit the checkout/);
  assert.doesNotMatch(skill, /active peer.*writes? a local lock/u);
});

test("goal-sdlc keeps real work in short-lived subagents", async () => {
  const skill = await readSkill();
  for (const marker of [
    "Subagents are the only delegation mechanism for real work",
    "do not use user-visible tasks\nor threads as workers",
    "create_thread",
    "fork_thread",
    "send_message_to_thread",
    "codex://threads/...",
    "100,000 tokens",
    "terminate the subagent",
    "start a fresh one",
  ]) {
    assert.ok(skill.includes(marker), `missing subagent lifecycle marker: ${marker}`);
  }
});

test("goal-sdlc retains failure checkpoints and completion gates", async () => {
  const skill = await readSkill();
  for (const marker of [
    "GitHub Project, PBI, pull request, comments, and\nchecks remain the durable administration record",
    "local review ledger or any other untracked administration file",
    "current head",
    "mark resolved\n  finding comments as resolved",
    "repository-required CI,\nstatic-analysis, security, integration/E2E, and Quality Guard diagnostics",
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
  assert.doesNotMatch(skill, /delete both the local and the remote copy of both the merged branch as well as/);
  assert.match(
    skill,
    new RegExp(
      [
        String.raw`Do not invoke \`\[dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)\``,
        String.raw`again after\s+merge; the preceding invocation owns the guarded\s+merge,`,
        String.raw`branch cleanup, and\s+Project finalization pass\.`,
      ].join(String.raw`\s+`),
    ),
  );
  assert.match(skill, /Then use:\s+\[dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)/);
  assert.doesNotMatch(
    skill,
    /After merge:\s+- Invoke `\[dod-guard:complete-pr\]\(\.\.\/complete-pr\/SKILL\.md\)` for the guarded/,
  );
});

test("goal-sdlc bounds workspace-loader recovery and separates acceptance evidence", async () => {
  const skill = await readSkill();
  for (const marker of [
    "Before broad validation gates, run the cheap workspace-loader preflight",
    "assign one recovery owner and record the",
    "at most one fresh bounded validator retry",
    "current head SHA, loader path, exact error, and validation stage",
    "If a protected user-owned path prevents broad discovery",
    "environment limitation separately from touched-path acceptance evidence",
    "changed paths, targeted checks",
    "The limitation does not trigger fan-out, a second",
    "A failed touched-path check remains an",
  ]) {
    assert.ok(skill.includes(marker), `missing workspace recovery marker: ${marker}`);
  }
  assert.match(
    skill,
    /Before broad validation gates[\s\S]*cheap workspace-loader preflight[\s\S]*at most one fresh bounded validator retry/,
  );
  assert.match(
    skill,
    /protected user-owned path[\s\S]*separately from touched-path acceptance evidence[\s\S]*protected path untouched/,
  );
});

test("goal-sdlc keeps external findings conditional and reconciles moving refs", async () => {
  const skill = await readSkill();
  for (const marker of [
    "If it reports\nfindings, or other review findings are supplied",
    "Inspect each finding against the current PR head",
    "Fix every valid finding with",
    "respond to each valid finding",
    "one ref-reconciliation owner",
    "old refs, suppress duplicate attestations",
    "recompute and attest the exact target once",
    "fully paginate the",
    "count parent PBIs and child PBIs separately",
    "never infer either count by incrementing a prior snapshot",
  ]) {
    assert.ok(skill.includes(marker), `missing workflow safeguard: ${marker}`);
  }
  assert.doesNotMatch(skill, /publish the saved recommendation|A GitHub `COMMENT` is publication transport/);
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
  assert.match(
    skill,
    /resolve the skill by name\s+under the active plugin root instead of substituting a local process document/,
  );
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

test("goal-sdlc records friction in one daily log instead of one issue per incident", async () => {
  const skill = await readSkill();
  assert.match(skill, /one PBI per day, titled `Friction log YYYY-MM-DD`/);
  assert.match(skill, /Do not create a separate backlog issue per incident/);
  assert.match(
    skill,
    /today's log already has an entry for the same friction[\s\S]*open non-log PBI that already owns the durable fix[\s\S]*Otherwise append a new entry/,
  );
  assert.match(skill, /what happened \(exact error, tool, stage, PBI, and SHA\); the workaround used; the durable fix/);
  assert.match(skill, /source-repository fix\s+as an entry in today's friction log/);
  assert.match(skill, /Never edit an installed plugin cache/);
  assert.doesNotMatch(skill, /repair the skill minimally in the plugin cache/);
  assert.doesNotMatch(skill, /If a cached skill or script must be edited/);
  assert.doesNotMatch(skill, /if no matching PBI exists, create one through `add-backlog-idea`/);
  assert.doesNotMatch(skill, /to track the long-term dod-guard repository fix/);
});
