import assert from "node:assert/strict";
import test from "node:test";
import { defaultQueueDecision, readQueueSnapshot, selectQueueItem } from "./lib/queue-readback.mjs";

// Records use the shape readQueueSnapshot builds, so these tests exercise the
// production classifier rather than a model of it.
const REPOSITORY = "TychoHenzen/dod-guard";
const CONTEXT = { repository: REPOSITORY, defaultBranch: "master" };

function mergedPullRequest(overrides = {}) {
  return {
    number: 540,
    repository: REPOSITORY,
    state: "CLOSED",
    mergedAt: "2026-09-27T00:00:00Z",
    headRepository: REPOSITORY,
    headRef: "codex/444",
    headSha: "head-444",
    trustedHead: true,
    baseRef: "master",
    mergeCommitSha: "merge-444",
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
    ...overrides,
  };
}

function record(issueNumber, overrides = {}) {
  const { state = "CLOSED", activeCheckpoint = false, ...fields } = overrides;
  return {
    issueNumber,
    parentIssueNumber: null,
    projectStatus: "Done",
    issue: { number: issueNumber, state, activeCheckpoint },
    pullRequests: [],
    staleRelationships: [],
    missingEvidence: [],
    ...fields,
  };
}

// #444 with children #536-#539, merged through PR #540.
function completeDelivery({ parent = {}, child = {}, pullRequest = {} } = {}) {
  return [
    record(444, { pullRequests: [mergedPullRequest(pullRequest)], ...parent }),
    ...[536, 537, 538, 539].map((number) => record(number, { parentIssueNumber: 444, ...child })),
  ];
}

function decide(records) {
  return defaultQueueDecision(records, CONTEXT);
}

function assertHold(records, ...reasons) {
  const decision = decide(records);
  assert.equal(decision.kind, "hold", JSON.stringify(decision));
  for (const reason of reasons) {
    assert.ok(decision.reasons.includes(reason), `missing reason "${reason}" in ${decision.reasons.join("; ")}`);
  }
}

test("a fully evidenced merged delivery is complete", () => {
  assert.deepEqual(decide(completeDelivery()), {
    kind: "complete",
    eligible: false,
    status: "Done",
    reasons: [],
  });
});

test("Todo and Backlog parents without a delivery are eligible", () => {
  const todo = record(517, { projectStatus: "Todo", state: "OPEN" });
  const backlog = record(31, { projectStatus: "Backlog", state: "OPEN" });
  assert.deepEqual(decide([todo]), { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  assert.equal(decide([backlog]).status, "Backlog");
});

test("a provider gap holds even a complete delivery", () => {
  assertHold(completeDelivery({ parent: { missingEvidence: ["issue #444"] } }), "issue #444");
});

test("open issues, open children, and non-Done statuses hold a merged delivery", () => {
  assertHold(
    completeDelivery({ child: { state: "OPEN", projectStatus: "In Progress" } }),
    "issue #536 is not closed",
    "Project item #536 is not Done",
    "Project status drift: Done, In Progress",
  );
});

test("the active checkpoint must be explicitly false before completion", () => {
  assertHold(
    completeDelivery({ parent: { activeCheckpoint: null } }),
    "active checkpoint for issue #444 is not explicitly false",
  );
  const active = record(517, { projectStatus: "Todo", state: "OPEN", activeCheckpoint: true });
  assertHold([active], "active implementation checkpoint remains");
});

test("each missing piece of merge evidence holds the delivery", () => {
  for (const [pullRequest, reason] of [
    [{ headRepository: "someone/fork" }, "pull request head repository is not the target repository"],
    [{ baseRef: "develop" }, "pull request base is not the default branch"],
    [{ trustedHead: false }, "trusted pull request head evidence is missing or stale"],
    [{ mergeCommitSha: undefined }, "merge commit is missing"],
    [{ requiredChecks: [{ name: "build-test", bucket: "fail" }] }, "required checks are incomplete or failed"],
    [{ requiredChecks: [] }, "required checks missing or empty"],
  ]) {
    assertHold(completeDelivery({ pullRequest }), reason);
  }
});

test("relationship changes during the read hold the delivery", () => {
  const stale = [{ kind: "pull-request", number: 540 }];
  assertHold(completeDelivery({ parent: { staleRelationships: stale } }), "relationship/head evidence changed during read");
});

test("a merged child alone, without its parent record, is an orphan hold", () => {
  const child = record(536, { parentIssueNumber: 444, pullRequests: [mergedPullRequest({ mergeCommitSha: undefined })] });
  assertHold([child], "orphaned parent/child relationship", "merge commit is missing");
});

test("queue selection groups children under their parent and keeps only the Todo", () => {
  const records = [
    record(31, { projectStatus: "Backlog", state: "OPEN", missingEvidence: ["issue #31"] }),
    ...completeDelivery(),
    record(517, { projectStatus: "Todo", state: "OPEN" }),
    record(600, { parentIssueNumber: 599, projectStatus: "Todo", state: "OPEN" }),
  ];
  const selected = selectQueueItem({ ...CONTEXT, records });
  assert.equal(selected.rootIssueNumber, 517);
  assert.deepEqual(selected.records.map(({ issueNumber }) => issueNumber), [517]);
});

test("queue selection skips a group whose statuses drift", () => {
  const records = [
    record(700, { projectStatus: "Todo", state: "OPEN" }),
    record(701, { parentIssueNumber: 700, projectStatus: "Backlog", state: "OPEN" }),
  ];
  assert.equal(selectQueueItem({ ...CONTEXT, records }), null);
  assertHold(records, "Project status drift: Todo, Backlog");
});

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
