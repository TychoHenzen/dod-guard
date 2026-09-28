import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { defaultQueueDecision, readQueueSnapshot } from "./lib/queue-readback.mjs";

const skillPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "SKILL.md",
);

async function readSkill() {
  return readFile(skillPath, "utf8");
}

function sortIssueNumbers(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))].sort(
    (left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }),
  );
}

function normalizeDeliveryRecord(input) {
  const inputs = Array.isArray(input) ? input : [input];
  const entries = inputs.map((raw) => ({
    raw,
    issueNumber: raw.issueNumber ?? null,
    parentIssueNumber: raw.parentIssueNumber ?? null,
    childIssueNumbers: sortIssueNumbers(raw.childIssueNumbers ?? []),
    observedIssueNumbers: sortIssueNumbers(raw.observedIssueNumbers ?? []),
  }));
  const rootEntry = entries.find(({ parentIssueNumber }) => parentIssueNumber === null) ?? entries[0];
  const rootIssueNumber = rootEntry?.parentIssueNumber ?? rootEntry?.issueNumber ?? null;
  const issueNumbers = sortIssueNumbers(entries.map(({ issueNumber }) => issueNumber));
  const childIssueNumbers = sortIssueNumbers([
    ...entries.flatMap(({ childIssueNumbers: declaredChildren }) => declaredChildren),
    ...issueNumbers.filter((issueNumber) => issueNumber !== rootIssueNumber),
  ]);
  const observedIssueNumbers = sortIssueNumbers([
    ...entries.flatMap(({ observedIssueNumbers: observed }) => observed),
    ...issueNumbers,
  ]);
  const hasParentRelation = entries.some(({ parentIssueNumber }) => parentIssueNumber !== null);
  const hasParentEntry = entries.some(
    ({ issueNumber, parentIssueNumber }) =>
      parentIssueNumber === null && issueNumber === rootIssueNumber,
  );
  const parentObserved =
    rootIssueNumber === null ||
    observedIssueNumbers.includes(rootIssueNumber) ||
    entries.some(({ raw }) => raw.parentPresent === true);
  const orphanedChild =
    hasParentRelation &&
    entries.some(({ raw }) => raw.parentPresent === false || !parentObserved);
  let relationship = "parent-no-children";
  if (orphanedChild) {
    relationship = "orphaned-child";
  } else if (hasParentEntry) {
    relationship = childIssueNumbers.length > 0 ? "parent" : "parent-no-children";
  } else if (hasParentRelation) {
    relationship = "child";
  } else if (childIssueNumbers.length > 0) {
    relationship = "parent";
  }
  const projectStatuses = entries
    .flatMap(({ raw }) => [
      ...(Array.isArray(raw.projectStatuses) ? raw.projectStatuses : []),
      ...(typeof raw.projectStatus === "string" ? [raw.projectStatus] : []),
      ...(Array.isArray(raw.childProjectStatuses) ? raw.childProjectStatuses : []),
    ])
    .filter((status) => typeof status === "string" && status.length > 0);

  return {
    representative: rootEntry?.raw ?? {},
    rootIssueNumber,
    relationship,
    memberIssueNumbers: sortIssueNumbers([rootIssueNumber, ...childIssueNumbers]),
    childIssueNumbers,
    observedIssueNumbers,
    projectStatuses,
    childrenReconciled: childIssueNumbers.every((issueNumber) =>
      observedIssueNumbers.includes(issueNumber),
    ),
    orphanedChild,
    statusDrift: new Set(projectStatuses).size > 1,
  };
}

function classifyDeliveryRecord(input) {
  const record = normalizeDeliveryRecord(input);
  const {
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
  } = record.representative;

  if (activeCheckpoint === true) {
    return { kind: "active", eligible: false };
  }

  const missing = [];
  if (record.relationship === "child") {
    missing.push("grouped parent reconciliation");
  }
  if (record.relationship === "orphaned-child") {
    missing.push("parent relationship");
  }
  if (record.relationship === "parent" && !record.childrenReconciled) {
    missing.push("grouped child records");
  }
  if (record.statusDrift) {
    missing.push("aligned Project statuses");
  }

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

function adapterProjectItem({ number, status, parentIssue, linkedPullRequests = [] }) {
  return {
    id: `adapter-${number}`,
    content: { number, repository: "TychoHenzen/dod-guard", state: "closed" },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: "TychoHenzen/dod-guard" },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: linkedPullRequests },
    ],
  };
}

function adapterProvider() {
  const mutations = [];
  const items = [
    adapterProjectItem({ number: 444, status: "Done", parentIssue: null, linkedPullRequests: [{ number: 540, repository: "TychoHenzen/dod-guard" }] }),
    adapterProjectItem({ number: 536, status: "Done", parentIssue: { number: 444 } }),
  ];
  const issues = new Map([
    [444, { number: 444, state: "closed", children: [{ number: 536, state: "closed" }], activeCheckpoint: false }],
    [536, { number: 536, state: "closed", parent: { number: 444 }, children: [], activeCheckpoint: false }],
  ]);
  return {
    mutations,
    listProjectItems: () => ({ items, pageInfo: { hasNextPage: false } }),
    readIssue: ({ issueNumber }) => issues.get(issueNumber),
    readPullRequest: () => ({
        number: 540,
        repository: "TychoHenzen/dod-guard",
        state: "closed",
        mergedAt: "2026-09-27T00:00:00Z",
        trustedHead: true,
        head: { repository: "TychoHenzen/dod-guard", ref: "codex/444", sha: "head-444" },
        base: { ref: "master", sha: "base-444" },
        mergeCommit: { oid: "merge-444" },
        requiredChecks: [{ name: "build-test", bucket: "pass" }],
      }),
    mutate: (...args) => mutations.push(args),
  };
}

const completeDeliveryEvidence = {
  mergedDelivery: true,
  activeCheckpoint: false,
  providerAvailable: true,
  acceptanceVerified: true,
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

const completeRecordEvidence = {
  ...completeDeliveryEvidence,
  issueNumber: 444,
  childIssueNumbers: [536, 537, 538, 539],
  observedIssueNumbers: [444, 536, 537, 538, 539],
  projectStatuses: ["Done", "Done", "Done", "Done", "Done"],
};

const completeEvidenceWithoutActiveCheckpoint = Object.fromEntries(
  Object.entries(completeRecordEvidence).filter(
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
    input: completeRecordEvidence,
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
    input: {
      ...completeDeliveryEvidence,
      issueNumber: 517,
      childIssueNumbers: [],
      observedIssueNumbers: [517],
      projectStatuses: ["Todo"],
      mergedDelivery: false,
    },
    expected: { kind: "eligible", eligible: true },
  },
  {
    name: "missing evidence is not completion",
    input: {
      mergedDelivery: true,
      issueNumber: 536,
      parentIssueNumber: 444,
      parentPresent: true,
    },
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
    input: {
      ...completeRecordEvidence,
      issueNumber: 536,
      parentIssueNumber: 444,
      parentPresent: true,
      childIssueNumbers: [],
      observedIssueNumbers: [536],
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["grouped parent reconciliation"],
    },
  },
  {
    name: "orphaned child",
    input: {
      ...completeRecordEvidence,
      issueNumber: 537,
      parentIssueNumber: 444,
      parentPresent: false,
      childIssueNumbers: [],
      observedIssueNumbers: [537],
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["parent relationship"],
    },
  },
  {
    name: "status drift",
    input: {
      ...completeRecordEvidence,
      projectStatuses: ["Done", "In Progress"],
    },
    expected: {
      kind: "hold",
      eligible: false,
      missing: ["aligned Project statuses"],
    },
  },
  {
    name: "no-child parent",
    input: {
      ...completeDeliveryEvidence,
      issueNumber: 31,
      childIssueNumbers: [],
      observedIssueNumbers: [31],
      projectStatuses: ["Backlog"],
      mergedDelivery: false,
    },
    expected: { kind: "eligible", eligible: true },
  },
];

test("contract control fixture uses the queue readback adapter", async () => {
  const provider = adapterProvider();
  const snapshot = await readQueueSnapshot({
    provider,
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
    defaultBranch: "master",
  });

  assert.deepEqual(snapshot.records.map(({ issueNumber }) => issueNumber), [444, 536]);
  assert.equal(snapshot.pullRequests[0].mergeCommitSha, "merge-444");
  assert.deepEqual(defaultQueueDecision(snapshot.records, snapshot), {
    kind: "complete",
    eligible: false,
    status: "Done",
    reasons: [],
  });
  assert.deepEqual(provider.mutations, []);
});

function reconcileQueue(records, provider) {
  const groups = new Map();
  for (const entry of records) {
    const input = provider.read(entry.input);
    const normalized = normalizeDeliveryRecord(input);
    const groupKey = normalized.rootIssueNumber ?? entry.id;
    const group = groups.get(groupKey) ?? { id: entry.id, inputs: [] };
    group.inputs.push(input);
    if (["parent", "parent-no-children"].includes(normalized.relationship)) {
      group.id = entry.id;
    }
    groups.set(groupKey, group);
  }
  const decisions = [...groups.values()].map(({ id, inputs }) => ({
    id,
    decision: classifyDeliveryRecord(inputs),
  }));
  return {
    decisions,
    candidates: decisions
      .filter(({ decision }) => decision.eligible)
      .map(({ id }) => id),
  };
}

test("normalizes parent, child, no-child, orphan, and status-drift ancestry", () => {
  const fixtures = [
    {
      name: "real parent",
      input: {
        issueNumber: 444,
        childIssueNumbers: [536, 537],
        observedIssueNumbers: [444, 536, 537],
      },
      expected: {
        rootIssueNumber: 444,
        relationship: "parent",
        memberIssueNumbers: [444, 536, 537],
        orphanedChild: false,
        statusDrift: false,
        childrenReconciled: true,
      },
    },
    {
      name: "child",
      input: {
        issueNumber: 536,
        parentIssueNumber: 444,
        parentPresent: true,
      },
      expected: {
        rootIssueNumber: 444,
        relationship: "child",
        memberIssueNumbers: [444, 536],
        orphanedChild: false,
        statusDrift: false,
        childrenReconciled: true,
      },
    },
    {
      name: "no-child parent",
      input: { issueNumber: 31, observedIssueNumbers: [31] },
      expected: {
        rootIssueNumber: 31,
        relationship: "parent-no-children",
        memberIssueNumbers: [31],
        orphanedChild: false,
        statusDrift: false,
        childrenReconciled: true,
      },
    },
    {
      name: "orphaned child",
      input: {
        issueNumber: 537,
        parentIssueNumber: 444,
        parentPresent: false,
      },
      expected: {
        rootIssueNumber: 444,
        relationship: "orphaned-child",
        memberIssueNumbers: [444, 537],
        orphanedChild: true,
        statusDrift: false,
        childrenReconciled: true,
      },
    },
    {
      name: "status drift",
      input: {
        issueNumber: 444,
        childIssueNumbers: [536],
        observedIssueNumbers: [444, 536],
        projectStatuses: ["Done", "Backlog"],
      },
      expected: {
        rootIssueNumber: 444,
        relationship: "parent",
        memberIssueNumbers: [444, 536],
        orphanedChild: false,
        statusDrift: true,
        childrenReconciled: true,
      },
    },
  ];

  for (const fixture of fixtures) {
    const record = normalizeDeliveryRecord(fixture.input);
    assert.deepEqual(
      {
        rootIssueNumber: record.rootIssueNumber,
        relationship: record.relationship,
        memberIssueNumbers: record.memberIssueNumbers,
        orphanedChild: record.orphanedChild,
        statusDrift: record.statusDrift,
        childrenReconciled: record.childrenReconciled,
      },
      fixture.expected,
      fixture.name,
    );
  }
});

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
    "normalize each issue group into one delivery record",
    "an orphaned child has",
    "status drift records the parent/child",
    "never select a child record",
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
      {
        id: "#536",
        input: reconciliationFixtures.find(({ name }) => name === "stale grouped child").input,
      },
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
    ],
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

test("goal-sdlc keeps real work in short-lived subagents", async () => {
  const skill = await readSkill();
  for (const marker of [
    "Subagents are the only delegation mechanism for real work",
    "Do not use\nuser-visible Codex tasks or threads as workers",
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

test("goal-sdlc publishes one completed review and reconciles moving refs", async () => {
  const skill = await readSkill();
  for (const marker of [
    "publish the saved recommendation and evidence once",
    "A GitHub `COMMENT` is publication transport, not a second review",
    "one ref-reconciliation owner",
    "Invalidate evidence tied to the old refs",
    "recompute and attest the exact target once",
    "fully paginate the",
    "count parent PBIs and child PBIs separately",
    "never infer either count by incrementing a prior snapshot",
  ]) {
    assert.ok(skill.includes(marker), `missing workflow safeguard: ${marker}`);
  }
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

test("goal-sdlc records friction in one daily log instead of one issue per incident", async () => {
  const skill = await readSkill();
  assert.match(skill, /one PBI per day, titled `Friction log YYYY-MM-DD`/);
  assert.match(skill, /Do not create a separate backlog issue per incident/);
  assert.match(
    skill,
    /today's log already has an entry for the same friction[\s\S]*open non-log PBI that already owns the durable fix[\s\S]*Otherwise append a new entry/,
  );
  assert.match(skill, /what happened \(exact error, tool, stage, PBI, and SHA\); the workaround used; the durable fix/);
  assert.match(skill, /long-term dod-guard repository fix as an entry in today's friction log/);
  assert.doesNotMatch(skill, /if no matching PBI exists, create one through `add-backlog-idea`/);
  assert.doesNotMatch(skill, /to track the long-term dod-guard repository fix/);
});
