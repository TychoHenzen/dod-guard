import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";

// Each case builds a closure-shaped snapshot and classifies it through classifyQueue, so the cases
// exercise the classifier that select-next and the closure judgement share.
const REPOSITORY = "TychoHenzen/dod-guard";
const TODAY = "2026-10-10";
const CHILDREN = [536, 537, 538, 539];

// A reference names its repository, as every relation in a snapshot does.
function ref(number, repository = REPOSITORY) {
  return { repository, number };
}

// A Project item whose fields name the repository. parentField false omits the Parent issue field,
// as a Project item that never recorded its parent does.
function item(number, status, { parent = null, linked = [], parentField = true } = {}) {
  const fields = [
    { name: "Status", value: { name: status } },
    { name: "Repository", value: REPOSITORY },
  ];
  if (parentField) fields.push({ name: "Parent issue", value: parent === null ? null : ref(parent) });
  fields.push({ name: "Linked pull requests", value: linked.map((pull) => ref(pull)) });
  return { id: `PVTI_${number}`, content: { number, repository: REPOSITORY }, fields };
}

// An issue of the repository. Its checkpoint is explicitly false unless a case changes it.
function issue(number, { state = "closed", parent = null, children = [], activeCheckpoint = false } = {}) {
  return {
    number,
    repository: REPOSITORY,
    state,
    title: `Issue ${number}`,
    parent: parent === null ? null : ref(parent),
    children: children.map((child) => ref(child)),
    activeCheckpoint,
  };
}

// A merged pull request whose head is the trusted head and whose required checks pass. A case overrides
// one piece of that evidence to show the hold it causes.
function pullRequest(number, overrides = {}) {
  return {
    number,
    repository: REPOSITORY,
    state: "CLOSED",
    mergedAt: "2026-09-27T00:00:00Z",
    head: { repository: REPOSITORY, ref: `codex/${number}`, sha: `head-${number}` },
    base: { ref: "master", sha: `base-${number}` },
    mergeCommit: { oid: `merge-${number}` },
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
    trustedHeadSha: `head-${number}`,
    ...overrides,
  };
}

function snapshot({ items = [], issues = [], pullRequests = [] } = {}) {
  return { repository: REPOSITORY, defaultBranch: "master", items, issues, pullRequests };
}

// #444 with children #536-#539, merged through pull request #540, which only #444's item links.
function deliveryItems() {
  return [item(444, "Done", { linked: [540] }), ...CHILDREN.map((number) => item(number, "Done", { parent: 444 }))];
}

function deliveryIssues() {
  return [issue(444, { children: CHILDREN }), ...CHILDREN.map((number) => issue(number, { parent: 444 }))];
}

function completeDelivery() {
  return snapshot({ items: deliveryItems(), issues: deliveryIssues(), pullRequests: [pullRequest(540)] });
}

function decisionOf(input, root) {
  const group = classifyQueue(input, { today: TODAY }).groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  return group.decision;
}

function assertHold(input, root, ...reasons) {
  const decision = decisionOf(input, root);
  assert.equal(decision.kind, "hold", JSON.stringify(decision));
  for (const reason of reasons) {
    assert.ok(decision.reasons.includes(reason), `missing "${reason}" in ${decision.reasons.join("; ")}`);
  }
}

function findIssue(input, number) {
  return input.issues.find((entry) => entry.number === number);
}

function findItem(input, number) {
  return input.items.find(({ content }) => content.number === number);
}

function setStatus(input, number, name) {
  findItem(input, number).fields.find((field) => field.name === "Status").value = { name };
}

test("a fully evidenced merged delivery is complete", () => {
  assert.deepEqual(decisionOf(completeDelivery(), 444), {
    kind: "complete",
    eligible: false,
    status: "Done",
    reasons: [],
  });
});

test("Todo and Backlog parents without a delivery are eligible", () => {
  const todo = snapshot({ items: [item(517, "Todo")], issues: [issue(517, { state: "open" })] });
  assert.deepEqual(decisionOf(todo, 517), { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  const backlog = snapshot({ items: [item(31, "Backlog")], issues: [issue(31, { state: "open" })] });
  assert.equal(decisionOf(backlog, 31).status, "Backlog");
});

test("an evidence gap holds even a complete delivery", () => {
  const input = completeDelivery();
  // #444 lists #535 as a sub-issue, but #535 has no Project item to carry its evidence.
  findIssue(input, 444).children.push(ref(535));
  assertHold(input, 444, "child issue #535 Project item");
});

test("an open child that is not Done holds a merged delivery", () => {
  const input = completeDelivery();
  findIssue(input, 536).state = "open";
  setStatus(input, 536, "In Progress");
  assertHold(
    input,
    444,
    "issue #536 is not closed",
    "Project item #536 is not Done",
    "Project status drift: Done, In Progress",
  );
});

test("the active checkpoint must be explicitly false before completion", () => {
  const absent = completeDelivery();
  delete findIssue(absent, 444).activeCheckpoint;
  assertHold(absent, 444, "active checkpoint for issue #444 is not explicitly false");
  const active = snapshot({
    items: [item(517, "Todo")],
    issues: [issue(517, { state: "open", activeCheckpoint: true })],
  });
  assertHold(active, 517, "active implementation checkpoint remains");
});

test("each missing piece of merge evidence holds the delivery", () => {
  const cases = [
    [
      { head: { repository: "someone/fork", ref: "codex/540", sha: "head-540" } },
      "pull request head repository is not the target repository",
    ],
    [{ base: { ref: "develop", sha: "base-540" } }, "pull request base is not the default branch"],
    [{ trustedHeadSha: "stale-540" }, "trusted pull request head evidence is missing or stale"],
    [{ mergeCommit: null }, "merge commit is missing"],
    [{ requiredChecks: [{ name: "build-test", bucket: "fail" }] }, "required checks are incomplete or failed"],
    [{ requiredChecks: [] }, "required checks missing or empty"],
  ];
  for (const [overrides, reason] of cases) {
    const input = completeDelivery();
    input.pullRequests[0] = pullRequest(540, overrides);
    assertHold(input, 444, reason);
  }
});

test("a contradictory parent holds the delivery", () => {
  const input = completeDelivery();
  // #536's Project Parent issue field still names #444, while its issue parent is now null.
  findIssue(input, 536).parent = null;
  assertHold(input, 444, "contradictory parent for issue #536");
});

test("a merged child alone, without its parent's item, is an orphan hold", () => {
  const input = snapshot({
    items: [item(536, "Done", { parent: 444, linked: [540] })],
    issues: [issue(536, { parent: 444 })],
    pullRequests: [pullRequest(540, { mergeCommit: null })],
  });
  assertHold(
    input,
    444,
    "orphaned parent/child relationship",
    "parent issue #444 Project item",
    "merge commit is missing",
  );
});

test("queue selection groups children under their parent and keeps only the Todo", () => {
  const input = snapshot({
    items: [
      item(31, "Backlog", { parentField: false }),
      ...deliveryItems(),
      item(517, "Todo"),
      item(600, "Todo", { parent: 599 }),
    ],
    issues: [
      issue(31, { state: "open" }),
      ...deliveryIssues(),
      issue(517, { state: "open" }),
      issue(600, { state: "open", parent: 599 }),
    ],
    pullRequests: [pullRequest(540)],
  });
  assert.equal(decisionOf(input, 31).kind, "hold");
  const { selected } = classifyQueue(input, { today: TODAY });
  assert.equal(selected.rootIssueNumber, 517);
  assert.deepEqual(
    selected.records.map(({ issueNumber }) => issueNumber),
    [517],
  );
});

test("queue selection skips a group whose statuses drift", () => {
  const input = snapshot({
    items: [item(700, "Todo"), item(701, "Backlog", { parent: 700 })],
    issues: [issue(700, { state: "open", children: [701] }), issue(701, { state: "open", parent: 700 })],
  });
  assert.equal(classifyQueue(input, { today: TODAY }).selected, null);
  assertHold(input, 700, "Project status drift: Todo, Backlog");
});

test("an In Progress parent is resumed, not held, by its own pull request", () => {
  const openPull = pullRequest(900, { state: "OPEN", mergedAt: null });
  const resumed = snapshot({
    items: [item(800, "In Progress", { linked: [900] })],
    issues: [issue(800, { state: "open" })],
    pullRequests: [openPull],
  });
  assert.deepEqual(decisionOf(resumed, 800), {
    kind: "in-progress",
    eligible: true,
    status: "In Progress",
    openPullRequest: true,
    reasons: [],
  });

  const checkpointed = snapshot({
    items: [item(801, "In Progress")],
    issues: [issue(801, { state: "open", activeCheckpoint: true })],
  });
  assert.equal(decisionOf(checkpointed, 801).openPullRequest, false);

  const gap = snapshot({
    items: [item(800, "In Progress", { linked: [900], parentField: false })],
    issues: [issue(800, { state: "open" })],
    pullRequests: [openPull],
  });
  assertHold(gap, 800, "Project item #800 Parent issue");

  const todoChild = snapshot({
    items: [item(801, "In Progress"), item(802, "Todo", { parent: 801 })],
    issues: [
      issue(801, { state: "open", children: [802], activeCheckpoint: true }),
      issue(802, { state: "open", parent: 801 }),
    ],
  });
  assert.equal(decisionOf(todoChild, 801).kind, "in-progress");

  const backlogChild = snapshot({
    items: [item(801, "In Progress"), item(802, "Backlog", { parent: 801 })],
    issues: [
      issue(801, { state: "open", children: [802], activeCheckpoint: true }),
      issue(802, { state: "open", parent: 801 }),
    ],
  });
  assertHold(backlogChild, 801, "Project status drift: In Progress, Backlog");
});

test("queue selection resumes In Progress work before starting Todo", () => {
  const input = snapshot({
    items: [item(517, "Todo"), item(801, "In Progress"), item(800, "In Progress", { linked: [900] })],
    issues: [
      issue(517, { state: "open" }),
      issue(801, { state: "open", activeCheckpoint: true }),
      issue(800, { state: "open" }),
    ],
    pullRequests: [pullRequest(900, { state: "OPEN", mergedAt: null })],
  });
  assert.equal(classifyQueue(input, { today: TODAY }).selected.rootIssueNumber, 800);
});
