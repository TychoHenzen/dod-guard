// Closure-shaped records the queue classifier tests share, so a test states only what it departs from.
import { classifyQueue } from "../queue-classifier.mjs";
import { REFINED_BODY } from "../refined-body.test-support.mjs";

export const REPOSITORY = "TychoHenzen/dod-guard";
export const FOREIGN_REPOSITORY = "other/repo";
export const TODAY = "2026-10-08";

// A reference that names its repository, as every relation in a snapshot does.
export function ref(number, repository = REPOSITORY) {
  return { repository, number };
}

// A Project item whose content, Repository field, and relations all name its repository.
export function item(number, status, options = {}) {
  const { id = `PVTI_${number}`, parent = null, linked = [], repository = REPOSITORY } = options;
  return {
    id,
    content: { number, repository },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: repository },
      { name: "Parent issue", value: parent },
      { name: "Linked pull requests", value: linked },
    ],
  };
}

export function issue(
  number,
  {
    repository = REPOSITORY,
    state = "open",
    title = `Issue ${number}`,
    parent = null,
    children = [],
    blockedBy = [],
    body = REFINED_BODY,
    comments = [],
    activeCheckpoint,
  } = {},
) {
  const record = { number, repository, state, title, parent, children, blockedBy, body, comments };
  if (activeCheckpoint !== undefined) record.activeCheckpoint = activeCheckpoint;
  return record;
}

export function pull(number, { state = "closed", mergedAt = "2026-10-01T00:00:00Z", trustedHeadSha } = {}) {
  const record = {
    number,
    repository: REPOSITORY,
    state,
    mergedAt,
    head: { repository: REPOSITORY, ref: `codex/${number}`, sha: `head-${number}` },
    base: { ref: "master", sha: `base-${number}` },
    mergeCommit: { oid: `merge-${number}` },
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
  };
  if (trustedHeadSha !== undefined) record.trustedHeadSha = trustedHeadSha;
  return record;
}

export function snapshot({ items = [], issues = [], pullRequests = [], branches } = {}) {
  const record = { repository: REPOSITORY, defaultBranch: "master", items, issues, pullRequests };
  if (branches !== undefined) record.branches = branches;
  return record;
}

// Target root 31 (Backlog) and root 517 (Todo) with child 518. Each group is healthy on its own.
export function healthy() {
  return snapshot({
    items: [item(31, "Backlog"), item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    issues: [issue(31), issue(517, { children: [ref(518)] }), issue(518, { parent: ref(517) })],
  });
}

export function classify(input, today = TODAY) {
  return classifyQueue(input, { today });
}

export function groupOf(result, root) {
  return result.groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
}

export function completedGroup(parentPulls, childPulls = []) {
  const pullNumbers = [...new Set([...parentPulls, ...childPulls])];
  return snapshot({
    items: [
      item(444, "Done", { linked: parentPulls.map((number) => ref(number)) }),
      item(445, "Done", { parent: ref(444), linked: childPulls.map((number) => ref(number)) }),
    ],
    issues: [
      issue(444, { state: "closed", children: [ref(445)], activeCheckpoint: false }),
      issue(445, { state: "closed", parent: ref(444), activeCheckpoint: false }),
    ],
    pullRequests: pullNumbers.map((number) => pull(number, { trustedHeadSha: `head-${number}` })),
  });
}
