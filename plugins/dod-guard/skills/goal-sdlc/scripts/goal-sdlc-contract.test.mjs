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
  sameRepositoryHead,
  defaultBase,
  trustedHead,
  mergeCommit,
  requiredChecks,
  linkedIssuesClosed,
  childrenClosed,
  projectDone,
  activeCheckpoint,
  providerAvailable,
  acceptanceVerified,
  headRelationshipValid,
  groupedChild,
}) {
  if (activeCheckpoint === true) {
    return { kind: "active", eligible: false };
  }

  const missing = [
    [groupedChild === false, "grouped parent reconciliation"],
  ]
    .filter(([present]) => present !== true)
    .map(([, evidence]) => evidence);

  if (mergedDelivery === true) {
    if (activeCheckpoint !== false) {
      missing.push("active checkpoint");
    }
    missing.push(
      ...[
        [providerAvailable, "provider evidence"],
        [acceptanceVerified, "acceptance evidence"],
        [sameRepositoryHead, "same-repository head"],
        [defaultBase, "default base"],
        [trustedHead, "trusted head"],
        [mergeCommit, "merge commit"],
        [requiredChecks, "required checks"],
        [linkedIssuesClosed, "closed linked issues"],
        [childrenClosed, "closed linked children"],
        [projectDone, "Done Project statuses"],
        [headRelationshipValid, "head/PR relationship"],
      ]
        .filter(([present]) => present !== true)
        .map(([, evidence]) => evidence),
    );
  }

  if (missing.length > 0) {
    return { kind: "hold", eligible: false, missing };
  }

  if (mergedDelivery === false) {
    return { kind: "eligible", eligible: true };
  }

  if (mergedDelivery === true) {
    return { kind: "complete", eligible: false, handoff: "complete-pr" };
  }

  return { kind: "hold", eligible: false, missing: ["delivery state"] };
}

const completeDeliveryEvidence = {
  mergedDelivery: true,
  activeCheckpoint: false,
  providerAvailable: true,
  acceptanceVerified: true,
  groupedChild: false,
  sameRepositoryHead: true,
  defaultBase: true,
  trustedHead: true,
  mergeCommit: true,
  requiredChecks: true,
  linkedIssuesClosed: true,
  childrenClosed: true,
  projectDone: true,
  headRelationshipValid: true,
};

const completeEvidenceWithoutActiveCheckpoint = Object.fromEntries(
  Object.entries(completeDeliveryEvidence).filter(
    ([evidence]) => evidence !== "activeCheckpoint",
  ),
);

const reconciliationFixtures = [
  {
    name: "#31 external acceptance hold",
    input: {
      ...completeDeliveryEvidence,
      providerAvailable: false,
      acceptanceVerified: false,
      linkedIssuesClosed: false,
      projectDone: false,
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: [
        "provider evidence",
        "acceptance evidence",
        "closed linked issues",
        "Done Project statuses",
      ],
    },
  },
  {
    name: "#33/#34 grouped verification hold",
    input: {
      ...completeDeliveryEvidence,
      requiredChecks: false,
      linkedIssuesClosed: false,
      childrenClosed: false,
      projectDone: false,
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: [
        "required checks",
        "closed linked issues",
        "closed linked children",
        "Done Project statuses",
      ],
    },
  },
  {
    name: "#444/#536-#539 complete delivery",
    input: completeDeliveryEvidence,
    expected: { kind: "complete", eligible: false, handoff: "complete-pr" },
  },
  {
    name: "missing active checkpoint",
    input: completeEvidenceWithoutActiveCheckpoint,
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["active checkpoint"],
    },
  },
  {
    name: "normal todo record",
    input: { ...completeDeliveryEvidence, mergedDelivery: false },
    expected: { kind: "eligible", eligible: true },
  },
  {
    name: "missing evidence is not completion",
    input: { mergedDelivery: true },
    expected: {
      kind: "hold",
      eligible: false,
      missing: [
        "grouped parent reconciliation",
        "active checkpoint",
        "provider evidence",
        "acceptance evidence",
        "same-repository head",
        "default base",
        "trusted head",
        "merge commit",
        "required checks",
        "closed linked issues",
        "closed linked children",
        "Done Project statuses",
        "head/PR relationship",
      ],
    },
  },
  {
    name: "active checkpoint",
    input: { ...completeDeliveryEvidence, mergedDelivery: false, activeCheckpoint: true },
    expected: { kind: "active", eligible: false },
  },
  {
    name: "provider limitation",
    input: { ...completeDeliveryEvidence, providerAvailable: false },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["provider evidence"],
    },
  },
  {
    name: "unresolved acceptance",
    input: { ...completeDeliveryEvidence, acceptanceVerified: false },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["acceptance evidence"],
    },
  },
  {
    name: "head mismatch",
    input: { ...completeDeliveryEvidence, sameRepositoryHead: false },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["same-repository head"],
    },
  },
  {
    name: "head relationship mismatch",
    input: { ...completeDeliveryEvidence, headRelationshipValid: false },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["head/PR relationship"],
    },
  },
  {
    name: "stale grouped child",
    input: { ...completeDeliveryEvidence, groupedChild: true },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["grouped parent reconciliation"],
    },
  },
];

function reconcileQueue(records, provider) {
  const decisions = records.map(({ id, input }) => ({
    id,
    decision: classifyDeliveryRecord(provider.read(input)),
  }));
  return {
    decisions,
    candidates: decisions
      .filter(({ decision }) => decision.eligible)
      .map(({ id }) => id),
  };
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
  assert.match(skill, /Reconcile the current repository's Project items before selecting a parent/);
  assert.match(skill, /paginate every Project page, filter to the target repository/);
  assert.match(skill, /treat every reconciliation input as an explicit live observation/);
  assert.match(
    skill,
    /omitted, unknown, stale, filtered, or provider-unavailable value is not/,
  );
  assert.match(skill, /classify the missing evidence as `hold`/);
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
    "active checkpoint explicitly observed as `false`",
    "classify a merged delivery with any missing check, open issue or child",
    "exclude it from queue candidates and hand any cleanup to",
    "queue candidates, report the exact missing evidence",
    "Keep this reconciliation read-only",
    "make zero mutation calls",
    "do not select a held or complete child as an independent parent",
  ]) {
    assert.ok(skill.includes(marker), `missing reconciliation marker: ${marker}`);
  }
});

test("mixed queue keeps only an explicit normal Todo and stays read-only", async () => {
  const mutationCalls = [];
  const provider = {
    read: (input) => input,
    mutate: (...args) => mutationCalls.push(args),
  };
  const reconciliation = reconcileQueue(
    [
      { id: "#31", input: reconciliationFixtures[0].input },
      { id: "#444", input: reconciliationFixtures[2].input },
      { id: "#517", input: reconciliationFixtures[4].input },
      { id: "#536", input: reconciliationFixtures.at(-1).input },
    ],
    provider,
  );

  assert.deepEqual(reconciliation.candidates, ["#517"]);
  assert.deepEqual(mutationCalls, []);
  assert.equal(typeof provider.mutate, "function");
  assert.deepEqual(
    reconciliation.decisions.map(({ id, decision }) => [id, decision.kind]),
    [
      ["#31", "hold"],
      ["#444", "complete"],
      ["#517", "eligible"],
      ["#536", "hold"],
    ],
  );
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
