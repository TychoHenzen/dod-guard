import assert from "node:assert/strict";
import test from "node:test";
import { indexSnapshot } from "./closure-index.mjs";
import { localDate } from "./friction-log.mjs";
import { buildQueueRecords, classifyDelivery, classifyQueue } from "./queue-classifier.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const FOREIGN_REPOSITORY = "other/repo";
const TODAY = "2026-10-08";

// A reference that names its repository, as every relation in a snapshot does.
function ref(number, repository = REPOSITORY) {
  return { repository, number };
}

// A Project item whose content, Repository field, and relations all name its repository.
function item(number, status, { id = `PVTI_${number}`, parent = null, linked = [], repository = REPOSITORY } = {}) {
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

function issue(number, { repository = REPOSITORY, state = "open", title = `Issue ${number}`, parent = null, children = [], activeCheckpoint } = {}) {
  const record = { number, repository, state, title, parent, children };
  if (activeCheckpoint !== undefined) record.activeCheckpoint = activeCheckpoint;
  return record;
}

function pull(number, { state = "closed", mergedAt = "2026-10-01T00:00:00Z", trustedHeadSha } = {}) {
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

function snapshot({ items = [], issues = [], pullRequests = [] } = {}) {
  return { repository: REPOSITORY, defaultBranch: "master", items, issues, pullRequests };
}

// Target root 31 (Backlog) and root 517 (Todo) with child 518. Each group is healthy on its own.
function healthy() {
  return snapshot({
    items: [item(31, "Backlog"), item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    issues: [issue(31), issue(517, { children: [ref(518)] }), issue(518, { parent: ref(517) })],
  });
}

function classify(input, today = TODAY) {
  return classifyQueue(input, { today });
}

function groupOf(result, root) {
  return result.groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
}

test("AC-01: every record is keyed by owner/name and a foreign record never supplies target data", () => {
  const input = healthy();
  input.items.push(item(517, "Done", { id: "PVTI_foreign_517", repository: FOREIGN_REPOSITORY }));
  input.issues.push(issue(517, { repository: FOREIGN_REPOSITORY, state: "closed", title: `Friction log ${TODAY}` }));
  const result = classify(input);
  const records = result.groups.flatMap(({ records: group }) => group);
  assert.deepEqual(records.map(({ key }) => key), [
    "tychohenzen/dod-guard#31",
    "tychohenzen/dod-guard#517",
    "tychohenzen/dod-guard#518",
  ]);
  assert.equal(result.selected.rootIssueNumber, 517);
  assert.equal(groupOf(result, 517).records[0].issue.title, "Issue 517");
  assert.equal(groupOf(result, 517).records[0].projectStatus, "Todo");
});

test("AC-01: a record with no repository identity fails the whole snapshot closed", () => {
  const unnamed = item(517, "Todo");
  delete unnamed.content.repository;
  unnamed.fields = unnamed.fields.filter(({ name }) => name !== "Repository");
  const input = healthy();
  input.items[1] = unnamed;
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.deepEqual(result.groups, []);
  assert.ok(result.missingEvidence.some((entry) => entry.startsWith("repository identity missing")));
});

test("AC-01: an issue with no repository identity fails the whole snapshot closed", () => {
  const unnamed = issue(517, { children: [ref(518)] });
  delete unnamed.repository;
  const input = healthy();
  input.issues[1] = unnamed;
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.deepEqual(result.groups, []);
  assert.ok(result.missingEvidence.some((entry) => entry.startsWith("repository identity missing")));
});

test("AC-02: a foreign item and issue numbered like a target root do not change the result", () => {
  const foreignItem = item(517, "Done", { id: "PVTI_foreign_517", repository: FOREIGN_REPOSITORY });
  const foreignIssue = issue(517, { repository: FOREIGN_REPOSITORY, state: "closed", title: "Foreign 517" });
  const target = healthy();
  const foreignFirst = snapshot({ items: [foreignItem, ...target.items], issues: [foreignIssue, ...target.issues] });
  const foreignLast = snapshot({ items: [...target.items, foreignItem], issues: [...target.issues, foreignIssue] });
  const targetCounts = classify(target).counts;
  for (const input of [foreignFirst, foreignLast]) {
    const result = classify(input);
    assert.equal(result.selected.rootIssueNumber, 517);
    const records = result.groups.flatMap(({ records: group }) => group);
    assert.ok(records.every(({ key }) => key.startsWith("tychohenzen/dod-guard#")));
    assert.ok(records.every(({ projectStatus }) => projectStatus !== "Done"));
    assert.deepEqual(result.counts, targetCounts);
  }
  assert.deepEqual(classify(foreignFirst), classify(foreignLast));
});

test("AC-03: a foreign parent holds its issue and leaves the same-numbered target group eligible", () => {
  const result = classify(snapshot({
    items: [item(40, "Todo", { parent: ref(41, FOREIGN_REPOSITORY) }), item(41, "Todo")],
    issues: [issue(40, { parent: ref(41, FOREIGN_REPOSITORY) }), issue(41)],
  }));
  assert.equal(groupOf(result, 40).decision.kind, "hold");
  assert.ok(groupOf(result, 40).decision.reasons.includes("cross-repository parent other/repo#41"));
  assert.deepEqual(groupOf(result, 41).decision, { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  assert.deepEqual(groupOf(result, 41).records.map(({ issueNumber }) => issueNumber), [41]);
  assert.equal(result.selected.rootIssueNumber, 41);
});

test("AC-03: a foreign sub-issue holds its issue and leaves the same-numbered target group eligible", () => {
  const result = classify(snapshot({
    items: [item(30, "Todo"), item(7, "Todo")],
    issues: [issue(30, { children: [ref(7, FOREIGN_REPOSITORY)] }), issue(7)],
  }));
  assert.equal(groupOf(result, 30).decision.kind, "hold");
  assert.ok(groupOf(result, 30).decision.reasons.includes("cross-repository sub-issue other/repo#7"));
  assert.deepEqual(groupOf(result, 7).decision, { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  assert.equal(result.selected.rootIssueNumber, 7);
});

test("AC-03: a foreign linked pull request holds its item and leaves the same-numbered target group eligible", () => {
  const result = classify(snapshot({
    items: [item(22, "Todo", { linked: [ref(9, FOREIGN_REPOSITORY)] }), item(9, "Todo")],
    issues: [issue(22), issue(9)],
  }));
  assert.equal(groupOf(result, 22).decision.kind, "hold");
  assert.ok(groupOf(result, 22).decision.reasons.includes("cross-repository linked pull request other/repo#9"));
  assert.deepEqual(groupOf(result, 9).decision, { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  assert.equal(result.selected.rootIssueNumber, 9);
});

test("counts report a record with no Parent issue field as unbalanced", () => {
  const unset = item(99, "Backlog");
  unset.fields = unset.fields.filter(({ name }) => name !== "Parent issue");
  const result = classify(snapshot({ items: [unset], issues: [issue(99)] }));
  assert.equal(result.counts.balanced, false);
  assert.deepEqual(result.counts.missingEvidence, ["Project item #99 Parent issue"]);
});

test("the friction log holds only a log dated on or after today", () => {
  const withTitle = (title) => snapshot({ items: [item(900, "Backlog")], issues: [issue(900, { title })] });
  const held = classify(withTitle("Friction log 2026-09-28"), "2026-09-28");
  assert.equal(groupOf(held, 900).decision.kind, "hold");
  assert.deepEqual(groupOf(held, 900).decision.reasons, ["friction log still collecting entries"]);
  for (const title of ["Friction log 2026-09-27", "Friction log 2026-09-28 follow-up"]) {
    assert.equal(classify(withTitle(title), "2026-09-28").selected.rootIssueNumber, 900, title);
  }
});

test("localDate formats the local calendar day", () => {
  assert.equal(localDate(new Date(2026, 8, 5, 23, 59)), "2026-09-05");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("an explicit today holds today's log and leaves an ordinary Backlog issue selectable", () => {
  const result = classify(snapshot({
    items: [item(900, "Backlog"), item(901, "Backlog")],
    issues: [issue(900, { title: "Friction log 2026-09-05" }), issue(901)],
  }), "2026-09-05");
  assert.deepEqual(groupOf(result, 900).decision.reasons, ["friction log still collecting entries"]);
  assert.equal(result.selected.rootIssueNumber, 901);
});

test("without a date an otherwise eligible group holds as local date missing", () => {
  const result = classifyQueue(healthy(), {});
  assert.equal(result.selected, null);
  assert.deepEqual(groupOf(result, 517).decision.reasons, ["local date missing"]);
});

test("the classifier reads no clock and no network while it classifies", () => {
  const originalDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const originalNow = globalThis.performance.now;
  function ThrowingDate() {
    throw new Error("clock read");
  }
  ThrowingDate.now = () => {
    throw new Error("clock read");
  };
  const frictionLog = 900;
  const nextRoot = 901;
  const input = snapshot({
    items: [item(frictionLog, "Backlog"), item(nextRoot, "Backlog")],
    issues: [issue(frictionLog, { title: "Friction log 2026-09-05" }), issue(nextRoot)],
  });
  let result;
  try {
    globalThis.Date = ThrowingDate;
    globalThis.fetch = () => {
      throw new Error("network read");
    };
    globalThis.performance.now = () => {
      throw new Error("clock read");
    };
    result = classify(input, "2026-09-05");
  } finally {
    globalThis.Date = originalDate;
    globalThis.fetch = originalFetch;
    globalThis.performance.now = originalNow;
  }
  assert.deepEqual(groupOf(result, frictionLog).decision.reasons, ["friction log still collecting entries"]);
  assert.equal(result.selected.rootIssueNumber, nextRoot);
});

test("AC-05: foreign Done parent and child items are excluded from the Done counts", () => {
  const target = snapshot({
    items: [item(31, "Backlog"), item(517, "Done"), item(518, "Done", { parent: ref(517) })],
    issues: [issue(31), issue(517, { children: [ref(518)] }), issue(518, { parent: ref(517) })],
  });
  const withForeign = snapshot({
    items: [
      ...target.items,
      item(600, "Done", { id: "PVTI_foreign_600", repository: FOREIGN_REPOSITORY }),
      item(601, "Done", { id: "PVTI_foreign_601", repository: FOREIGN_REPOSITORY, parent: ref(600, FOREIGN_REPOSITORY) }),
    ],
    issues: target.issues,
  });
  const counts = classify(withForeign).counts;
  assert.equal(counts.parentDoneItems, 1);
  assert.equal(counts.childDoneItems, 1);
  assert.deepEqual(counts, classify(target).counts);
});

test("AC-09: a duplicate Project item selects nothing and is named in missingEvidence", () => {
  const input = healthy();
  input.items.push(item(517, "Backlog"));
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("duplicate Project item: TychoHenzen/dod-guard#517"));
  assert.equal(classify(healthy()).selected.rootIssueNumber, 517);
});

test("AC-09: an item whose issue is absent selects nothing and is named in missingEvidence", () => {
  const input = healthy();
  input.issues = input.issues.filter(({ number }) => number !== 31);
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("issue missing from issues: TychoHenzen/dod-guard#31"));
  assert.equal(classify(healthy()).selected.rootIssueNumber, 517);
});

test("AC-09: a target linked pull request absent from pullRequests selects nothing and is named in missingEvidence", () => {
  const input = healthy();
  input.items[0] = item(31, "Backlog", { linked: [ref(540)] });
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("pull request missing from pullRequests: TychoHenzen/dod-guard#540"));
  const corrected = healthy();
  corrected.items[0] = item(31, "Backlog", { linked: [ref(540)] });
  corrected.pullRequests.push({ ...pull(540, { state: "open", mergedAt: null }) });
  assert.equal(classify(corrected).selected.rootIssueNumber, 517);
});

test("AC-09: a target item with no content number selects nothing and is named in missingEvidence", () => {
  const input = healthy();
  input.items.push(item(null, "Backlog", { id: "PVTI_nonumber" }));
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.deepEqual(result.groups, []);
  assert.ok(result.missingEvidence.includes("issue number missing: Project item PVTI_nonumber"), result.missingEvidence.join("; "));
  const healthyRoot = 517;
  assert.equal(classify(healthy()).selected.rootIssueNumber, healthyRoot);
});

test("a foreign item with no content number changes nothing", () => {
  const input = healthy();
  input.items.push(item(null, "Todo", { id: "PVTI_foreign_nonumber", repository: FOREIGN_REPOSITORY }));
  assert.deepEqual(classify(input), classify(healthy()));
});

test("an overlay alone sets the checkpoint and trusted head that a decision reads", () => {
  const input = snapshot({
    items: [item(444, "Done", { linked: [ref(540)] })],
    issues: [issue(444, { state: "closed", activeCheckpoint: false })],
    pullRequests: [pull(540, { trustedHeadSha: "head-540" })],
  });
  const index = indexSnapshot(input);
  const context = { repository: REPOSITORY, defaultBranch: "master" };
  const deliveryRoot = 444;
  const unsettled = buildQueueRecords(index, { overlay: { checkpoints: new Map(), trustedHeads: new Map() } });
  assert.equal(unsettled[0].issue.activeCheckpoint, null);
  assert.equal(unsettled[0].pullRequests[0].trustedHeadSha, null);
  assert.deepEqual(classifyDelivery(unsettled, deliveryRoot, context).decision.reasons, [
    "trusted pull request head evidence is missing or stale",
    "active checkpoint for issue #444 is not explicitly false",
  ]);
  const settled = buildQueueRecords(index, {
    overlay: { checkpoints: new Map([[444, false]]), trustedHeads: new Map([[540, "head-540"]]) },
  });
  assert.deepEqual(classifyDelivery(settled, deliveryRoot, context).decision, { kind: "complete", eligible: false, status: "Done", reasons: [] });
});

test("a linked pull request absent from pullRequests is missing evidence on its record and holds its group", () => {
  const input = healthy();
  input.items[0] = item(31, "Backlog", { linked: [ref(540)] });
  const records = buildQueueRecords(indexSnapshot(input));
  const missing = "pull request missing from pullRequests: TychoHenzen/dod-guard#540";
  assert.ok(records.find(({ issueNumber }) => issueNumber === 31).missingEvidence.includes(missing));
  const backlogRoot = 31;
  const group = classifyDelivery(records, backlogRoot, { repository: REPOSITORY, defaultBranch: "master" });
  assert.equal(group.decision.kind, "hold");
  assert.ok(group.decision.reasons.includes(missing));
});

test("classifyDelivery judges a parented root as its own delivery while its queue group sits under the parent", () => {
  const input = snapshot({
    items: [item(683, "Backlog"), item(840, "Done", { parent: ref(683), linked: [ref(901)] })],
    issues: [issue(683, { children: [ref(840)] }), issue(840, { state: "closed", parent: ref(683), activeCheckpoint: false })],
    pullRequests: [pull(901, { trustedHeadSha: "head-901" })],
  });
  const records = buildQueueRecords(indexSnapshot(input));
  const context = { repository: REPOSITORY, defaultBranch: "master" };
  const delivery = classifyDelivery(records, 840, context);
  assert.equal(delivery.decision.kind, "complete");
  assert.deepEqual(delivery.records.map(({ issueNumber }) => issueNumber), [840]);
  const parentRoot = 683;
  const queueGroup = classifyQueue(input, { today: TODAY }).groups.find(({ rootIssueNumber }) => rootIssueNumber === parentRoot);
  assert.deepEqual(queueGroup.records.map(({ issueNumber }) => issueNumber), [683, 840]);
});

test("classifyDelivery returns null for a number no record carries", () => {
  const records = buildQueueRecords(indexSnapshot(healthy()));
  assert.equal(classifyDelivery(records, 999, { repository: REPOSITORY, defaultBranch: "master" }), null);
});
