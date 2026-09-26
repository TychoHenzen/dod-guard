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

function classifyDeliveryRecord({
  mergedDelivery,
  sameRepositoryHead = true,
  defaultBase = true,
  trustedMerge = true,
  requiredChecks = true,
  linkedIssuesClosed = true,
  projectDone = true,
  activeCheckpoint = false,
}) {
  if (activeCheckpoint) {
    return { kind: "active", eligible: false };
  }
  if (!mergedDelivery) {
    return { kind: "eligible", eligible: true };
  }
  const missing = [
    [sameRepositoryHead, "same-repository head"],
    [defaultBase, "default base"],
    [trustedMerge, "trusted merge"],
    [requiredChecks, "required checks"],
    [linkedIssuesClosed, "closed linked issues"],
    [projectDone, "Done Project statuses"],
  ]
    .filter(([present]) => !present)
    .map(([, evidence]) => evidence);
  if (missing.length > 0) {
    return { kind: "hold", eligible: false, missing };
  }
  return { kind: "complete", eligible: false, handoff: "complete-pr" };
}

const reconciliationFixtures = [
  {
    name: "#31 external acceptance hold",
    input: {
      mergedDelivery: true,
      linkedIssuesClosed: false,
      projectDone: false,
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["closed linked issues", "Done Project statuses"],
    },
  },
  {
    name: "#33/#34 grouped verification hold",
    input: {
      mergedDelivery: true,
      requiredChecks: false,
      linkedIssuesClosed: false,
      projectDone: false,
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["required checks", "closed linked issues", "Done Project statuses"],
    },
  },
  {
    name: "#444/#536-#539 complete delivery",
    input: { mergedDelivery: true },
    expected: { kind: "complete", eligible: false, handoff: "complete-pr" },
  },
  {
    name: "normal todo record",
    input: { mergedDelivery: false },
    expected: { kind: "eligible", eligible: true },
  },
];

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
  assert.match(skill, /Reconcile the current repository's Project items before selecting a parent/);
  assert.match(skill, /paginate every Project page, filter to the target repository/);
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

test("reconciliation excludes stale merged records and recognizes complete grouped delivery", async () => {
  const skill = await readSkill();
  for (const fixture of reconciliationFixtures) {
    assert.deepEqual(
      classifyDeliveryRecord(fixture.input),
      fixture.expected,
      fixture.name,
    );
  }
  for (const marker of [
    "classify a merged delivery as `complete` only when the existing",
    "classify a merged delivery with any missing check, open issue or child",
    "exclude it from queue candidates and hand any cleanup to",
    "queue candidates, report the exact missing evidence",
    "Keep this reconciliation read-only",
    "do not select a held or complete child as an independent parent",
  ]) {
    assert.ok(skill.includes(marker), `missing reconciliation marker: ${marker}`);
  }
});

test("goal-sdlc keeps built-in goal ownership and delegated execution explicit", async () => {
  const skill = await readSkill();
  assert.match(skill, /supporting skill for built-in `\/goal` runs/);
  assert.match(skill, /does not implement,\nreplace, or claim the built-in `\/goal` command/);
  assert.match(skill, /Dispatch at least one fresh subagent/);
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
    "reviewAttempted=true",
    "current head",
    "all finding comments were marked as resolved",
    "Retry the same exact transient failure at most once",
    "Preserve the checkpoint on failure or interruption; repair the same step",
    "Then use:",
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
