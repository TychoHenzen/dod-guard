import assert from "node:assert/strict";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { REFINED_BODY } from "../../../lib/refined-body.test-support.mjs";

// Each case builds a closure-shaped snapshot and classifies it through classifyQueue, so the cases
// exercise the classifier that select-next and the closure judgement share.
const REPOSITORY = "TychoHenzen/dod-guard";
export const TODAY = "2026-10-10";
const CHILDREN = [536, 537, 538, 539];

// A reference names its repository, as every relation in a snapshot does.
export function ref(number, repository = REPOSITORY) {
  return { repository, number };
}

// A Project item whose fields name the repository. parentField false omits the Parent issue field,
// as a Project item that never recorded its parent does.
export function item(number, status, { parent = null, linked = [], parentField = true } = {}) {
  const fields = [
    { name: "Status", value: { name: status } },
    { name: "Repository", value: REPOSITORY },
  ];
  if (parentField) fields.push({ name: "Parent issue", value: parent === null ? null : ref(parent) });
  fields.push({ name: "Linked pull requests", value: linked.map((pull) => ref(pull)) });
  return { id: `PVTI_${number}`, content: { number, repository: REPOSITORY }, fields };
}

// An issue of the repository. Its checkpoint is explicitly false unless a case changes it.
export function issue(
  number,
  {
    state = "closed",
    parent = null,
    children = [],
    blockedBy = [],
    body = REFINED_BODY,
    comments = [],
    activeCheckpoint = false,
  } = {},
) {
  return {
    number,
    repository: REPOSITORY,
    state,
    title: `Issue ${number}`,
    parent: parent === null ? null : ref(parent),
    children: children.map((child) => ref(child)),
    blockedBy,
    body,
    comments,
    activeCheckpoint,
  };
}

// A merged pull request whose head is the trusted head and whose required checks pass. A case overrides
// one piece of that evidence to show the hold it causes.
export function pullRequest(number, overrides = {}) {
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

export function snapshot({ items = [], issues = [], pullRequests = [] } = {}) {
  return { repository: REPOSITORY, defaultBranch: "master", items, issues, pullRequests };
}

// #444 with children #536-#539, merged through pull request #540, which only #444's item links.
export function deliveryItems() {
  return [item(444, "Done", { linked: [540] }), ...CHILDREN.map((number) => item(number, "Done", { parent: 444 }))];
}

export function deliveryIssues() {
  return [issue(444, { children: CHILDREN }), ...CHILDREN.map((number) => issue(number, { parent: 444 }))];
}

export function completeDelivery() {
  return snapshot({ items: deliveryItems(), issues: deliveryIssues(), pullRequests: [pullRequest(540)] });
}

export function decisionOf(input, root) {
  const group = classifyQueue(input, { today: TODAY }).groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  return group.decision;
}

export function assertHold(input, root, ...reasons) {
  const decision = decisionOf(input, root);
  assert.equal(decision.kind, "hold", JSON.stringify(decision));
  for (const reason of reasons) {
    assert.ok(decision.reasons.includes(reason), `missing "${reason}" in ${decision.reasons.join("; ")}`);
  }
}

export function findIssue(input, number) {
  return input.issues.find((entry) => entry.number === number);
}

function findItem(input, number) {
  return input.items.find(({ content }) => content.number === number);
}

export function setStatus(input, number, name) {
  findItem(input, number).fields.find((field) => field.name === "Status").value = { name };
}
