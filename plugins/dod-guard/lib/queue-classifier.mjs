// The one queue classifier that select-next and the closure judgement share. It keys every Project
// item, issue, and pull request by owner/name#number, so no record from another repository can stand
// in for a target record. It reads no provider and no clock: the caller passes the snapshot and the
// local date.

import {
  fieldValue,
  indexSnapshot,
  issueFor,
  isTargetReference,
  itemFor,
  itemPullNumbers,
  itemStatus,
  numberOf,
  present,
  pullFor,
  qualifiedKey,
  referenceRepository,
  relationReasons,
} from "./closure-index.mjs";
import { collectingFrictionLog } from "./friction-log.mjs";
import { branchesOf } from "./queue-branches.mjs";
import { firstDecision, hold, parkedDecision, readyDecision } from "./queue-readiness.mjs";
import { sameRepository } from "./repository-identity.mjs";

const OPEN_PULL_REQUEST = "open implementation pull request remains active";
const ACTIVE_CHECKPOINT = "active implementation checkpoint remains";
// An In Progress parent whose only holds are its own open pull request or
// checkpoint is a delivery to resume, not a blocker.
const RESUMABLE_REASONS = new Set([OPEN_PULL_REQUEST, ACTIVE_CHECKPOINT]);
const PASSING_CHECK_BUCKETS = new Set(["pass", "skipping"]);

function normalizedStatus(status) {
  return typeof status === "string" ? status : null;
}

function doneStatus(status) {
  return typeof status === "string" && status.toLowerCase() === "done";
}

function issueState(issue) {
  return typeof issue?.state === "string" ? issue.state.toUpperCase() : null;
}

function fieldPresent(item, name) {
  return Array.isArray(item?.fields) && item.fields.some((field) => field?.name === name);
}

// A missing issue or an unstated checkpoint is null, and null is never read as finished.
function activeCheckpointOf(record) {
  return record.issue?.activeCheckpoint ?? null;
}

function mergedPullRequest(pullRequest) {
  return Boolean(pullRequest?.mergedAt) || String(pullRequest?.state ?? "").toUpperCase() === "MERGED";
}

function pullRequestState(pullRequest) {
  return String(pullRequest?.state ?? "").toUpperCase();
}

function checkBucket(check) {
  const bucket = check?.bucket ?? check?.conclusion ?? check?.status ?? check?.state;
  if (typeof bucket !== "string") return null;
  const normalized = bucket.toLowerCase();
  if (["success", "passed", "pass", "skipped", "neutral"].includes(normalized)) return "pass";
  if (["pending", "queued", "in_progress"].includes(normalized)) return "pending";
  if (["failure", "failed", "fail", "cancelled", "cancel"].includes(normalized)) return "fail";
  return normalized;
}

function requiredChecksComplete(value) {
  const checks = Array.isArray(value) ? value : value?.checks;
  if (!Array.isArray(checks) || checks.length === 0)
    return { complete: false, reason: "required checks missing or empty" };
  const invalid = checks.filter((check) => !PASSING_CHECK_BUCKETS.has(checkBucket(check)));
  if (invalid.length > 0) return { complete: false, reason: "required checks are incomplete or failed" };
  if (value && !Array.isArray(value) && value.complete === false)
    return { complete: false, reason: "required checks are incomplete" };
  return { complete: true };
}

// Only a head that a recorded SHA names is trusted. An empty or missing SHA is no evidence at all.
function trustedHead(pullRequest) {
  const { trustedHeadSha, headSha } = pullRequest;
  return typeof trustedHeadSha === "string" && trustedHeadSha !== "" && trustedHeadSha === headSha;
}

function mergedEvidenceReasons(records, context, mergedPullRequests) {
  const reasons = [];
  const { repository, defaultBranch } = context;
  if (!repository) reasons.push("target repository identity missing");
  if (!defaultBranch) reasons.push("default base branch missing");
  if (mergedPullRequests.length !== 1) reasons.push("merged delivery relationship is missing or duplicated");
  for (const pullRequest of mergedPullRequests) {
    if (!sameRepository(pullRequest.headRepository, repository))
      reasons.push("pull request head repository is not the target repository");
    if (!defaultBranch || pullRequest.baseRef !== defaultBranch)
      reasons.push("pull request base is not the default branch");
    if (!(pullRequest.headRef && pullRequest.headSha)) reasons.push("trusted pull request head is missing");
    if (!trustedHead(pullRequest)) reasons.push("trusted pull request head evidence is missing or stale");
    if (!pullRequest.mergeCommitSha) reasons.push("merge commit is missing");
    const checks = requiredChecksComplete(pullRequest.requiredChecks);
    if (!checks.complete) reasons.push(checks.reason);
  }
  for (const record of records) {
    if (!record.issue || issueState(record.issue) !== "CLOSED")
      reasons.push(`issue #${record.issueNumber} is not closed`);
    if (record.projectStatus !== "Done") reasons.push(`Project item #${record.issueNumber} is not Done`);
    if (activeCheckpointOf(record) !== false)
      reasons.push(`active checkpoint for issue #${record.issueNumber} is not explicitly false`);
  }
  return [...new Set(reasons)];
}

function pullRequestReasons(pullRequests) {
  const reasons = [];
  if (pullRequests.some((pullRequest) => pullRequestState(pullRequest) === "OPEN")) {
    reasons.push(OPEN_PULL_REQUEST);
  }
  if (pullRequests.some((pullRequest) => !pullRequest?.state)) reasons.push("pull request state missing");
  const unmerged = pullRequests.filter((pullRequest) => !mergedPullRequest(pullRequest));
  if (unmerged.some((pullRequest) => pullRequestState(pullRequest) === "CLOSED")) {
    reasons.push("closed pull request is not a verified merge");
  }
  const settled = new Set(["CLOSED", "OPEN"]);
  if (unmerged.some((pullRequest) => !settled.has(pullRequestState(pullRequest)))) {
    reasons.push("pull request outcome is unresolved");
  }
  return reasons;
}

// /next-ticket moves only the parent to In Progress; its children stay Todo
// until /complete-pr finalizes them, so that drift is expected here.
function resumableDecision(reasons, records) {
  const statuses = new Set(records.map(({ projectStatus }) => projectStatus));
  const root = records.find(({ parentIssueNumber }) => parentIssueNumber === null);
  if (root?.projectStatus !== "In Progress") return null;
  if (![...statuses].every((status) => ["In Progress", "Todo"].includes(status))) return null;
  const expected = (reason) => RESUMABLE_REASONS.has(reason) || reason.startsWith("Project status drift: ");
  if (!reasons.every(expected)) return null;
  return {
    kind: "in-progress",
    eligible: true,
    status: "In Progress",
    openPullRequest: reasons.includes(OPEN_PULL_REQUEST),
    reasons: [],
  };
}

const PARENT_GAP_ANCHORS = ["contradictory parent for issue #", "child issue #"];

// A record's entries, with its parent-item gap rendered from its flag at the position the text always
// had: before the first contradictory-parent or child entry, otherwise last.
function evidenceOf(record) {
  const entries = [...(record.missingEvidence ?? [])];
  if (record.parentItemMissing) {
    const at = entries.findIndex((text) => PARENT_GAP_ANCHORS.some((anchor) => text.startsWith(anchor)));
    entries.splice(at === -1 ? entries.length : at, 0, `parent issue #${record.parentIssueNumber} Project item`);
  }
  return [...new Set(entries)];
}

function recordReasons(records) {
  const reasons = records.flatMap((record) => [...evidenceOf(record), ...(record.relationHolds ?? [])]);
  const statuses = records.map(({ projectStatus }) => normalizedStatus(projectStatus));
  const uniqueStatuses = [...new Set(statuses.filter(Boolean))];
  if (statuses.some((status) => status === null)) reasons.push("Project status missing");
  if (uniqueStatuses.length > 1) reasons.push(`Project status drift: ${uniqueStatuses.join(", ")}`);
  const recordNumbers = new Set(records.map(({ issueNumber }) => issueNumber));
  const orphaned = (record) =>
    record.parentIssueNumber !== null && (record.orphan || !recordNumbers.has(record.parentIssueNumber));
  if (records.some(orphaned)) reasons.push("orphaned parent/child relationship");
  if (records.some((record) => activeCheckpointOf(record) === true)) reasons.push(ACTIVE_CHECKPOINT);
  return { reasons, uniqueStatuses };
}

function mergedDecision(reasons) {
  return reasons.length > 0 ? hold(reasons) : { kind: "complete", eligible: false, status: "Done", reasons: [] };
}

// The evidence every judgement shares. The merged pull requests' own evidence is appended only when one
// is merged, so the reasons keep the order they have always had.
function groupEvidence(records, context) {
  const { reasons, uniqueStatuses } = recordReasons(records);
  const pullRequests = [
    ...new Map(
      records
        .flatMap(({ pullRequests: linked }) => linked ?? [])
        .map((pullRequest) => [qualifiedKey(pullRequest.repository, pullRequest.number), pullRequest]),
    ).values(),
  ];
  reasons.push(...pullRequestReasons(pullRequests));
  const merged = pullRequests.filter(mergedPullRequest);
  if (merged.length > 0) {
    reasons.push(...mergedEvidenceReasons(records, context, merged));
  }
  return { reasons, uniqueStatuses, merged };
}

// A closed issue with no verified merged delivery holds its group. A friction log still collecting entries
// is named first, so the reason order stays what it has always been.
function closedIssueDecision(records, reasons, context) {
  const closed = records
    .filter((record) => issueState(record.issue) === "CLOSED")
    .map((record) => `issue #${record.issueNumber} is closed without a verified merged delivery`);
  if (closed.length === 0) return null;
  const collecting = typeof context.today === "string" && collectingFrictionLog(records, context.today);
  return hold([...reasons, ...(collecting ? ["friction log still collecting entries"] : []), ...closed]);
}

// Each row is [reason, blocks]. Without a date the friction log cannot be read, so the group is held
// rather than assumed clear. The first blocking row names the hold.
const QUEUE_CHECKS = [
  ["local date missing", (records, { today }) => typeof today !== "string"],
  ["friction log still collecting entries", (records, { today }) => collectingFrictionLog(records, today)],
  [
    "Project status is not a queue status",
    (records, context, statuses) => statuses.length !== 1 || !["Todo", "Backlog"].includes(statuses[0]),
  ],
  ["issue readback missing", (records) => records.some((record) => record.issue === null)],
];

function queueDecision(records, context, { reasons, uniqueStatuses }) {
  if (reasons.length > 0) return hold(reasons);
  const failed = QUEUE_CHECKS.find(([, blocks]) => blocks(records, context, uniqueStatuses));
  return failed ? hold([failed[0]]) : readyDecision(records, context, uniqueStatuses[0]);
}

function unmergedDecision(records, context, evidence) {
  return firstDecision([
    () => closedIssueDecision(records, evidence.reasons, context),
    () => parkedDecision(records),
    () => resumableDecision(evidence.reasons, records),
    () => queueDecision(records, context, evidence),
  ]);
}

// A closed umbrella parent is delivered by its children, not by one pull request of its own. It is
// complete when its root has children, every record of the group is settled (closed as completed, and
// Done where it is a Project item), and no pull request of the group is still open. A closed issue is
// not asked for an explicit false checkpoint, because handoffs older than the marker cannot carry one,
// but an explicitly active checkpoint or a relationship hold still stops the shortcut.
// A root closed as not planned and Done, with every sub-issue settled, is retired on purpose: it is
// complete with or without children, because no delivery was ever owed for it.
function settledUmbrella(records) {
  const root = records.find(({ parentIssueNumber }) => parentIssueNumber === null);
  const delivered = root?.hasChildren === true && root.settled === true;
  const retired = root?.retired === true && doneStatus(root.projectStatus);
  if (!delivered && !retired) return false;
  if (!records.every(({ settledSub }) => settledSub === true)) return false;
  // Relationship, parent, and checkpoint evidence still holds: only the merged-delivery rules are relaxed.
  if (recordReasons(records).reasons.length > 0) return false;
  return !records.some(({ pullRequests }) => pullRequests.some((pull) => pullRequestState(pull) === "OPEN"));
}

// A merged delivery is judged by its completion evidence alone, so it is either complete or held and
// is never queued as work.
function decideGroup(records, context) {
  if (!Array.isArray(records) || records.length === 0) return hold(["delivery record missing"]);
  if (settledUmbrella(records)) return mergedDecision([]);
  const evidence = groupEvidence(records, context);
  return evidence.merged.length > 0 ? mergedDecision(evidence.reasons) : unmergedDecision(records, context, evidence);
}

// The closure judges completion evidence only, so it never reads the date, the friction log, or the
// queue status. A delivery with no merged pull request is held for that alone.
function decideDelivery(records, context) {
  const { reasons, merged } = groupEvidence(records, context);
  if (merged.length === 0) {
    return hold([...reasons, "no merged pull request linked to the delivery"]);
  }
  return mergedDecision(reasons);
}

// A field of the wrong type reads as absent, and absent is never read as finished or unblocked.
const orNull = (isExpected) => (value) => (isExpected(value) ? value : null);
const listOrNull = orNull(Array.isArray);
const stringOrNull = orNull((value) => typeof value === "string");
const booleanOrNull = orNull((value) => typeof value === "boolean");

function issueRecord(number, issue, overlay) {
  return {
    number,
    state: issue.state,
    title: issue.title ?? null,
    stateReason: stringOrNull(issue.state_reason ?? issue.stateReason),
    activeCheckpoint: booleanOrNull(overlay ? overlay.checkpoints.get(number) : issue.activeCheckpoint),
    blockedBy: listOrNull(issue.blockedBy),
    body: stringOrNull(issue.body),
    comments: listOrNull(issue.comments),
  };
}

function trustedHeadOf(pull, number, overlay) {
  return overlay ? (overlay.trustedHeads.get(number) ?? null) : (pull.trustedHeadSha ?? null);
}

function pullRequestRecords(index, item, overlay) {
  return itemPullNumbers(index, item)
    .map((number) => ({ number, pull: pullFor(index, number) }))
    .filter(({ pull }) => pull !== null)
    .map(({ number, pull }) => ({
      repository: index.repository,
      number,
      state: pull.state,
      mergedAt: pull.mergedAt ?? null,
      headRepository: pull.head?.repository ?? null,
      headRef: pull.head?.ref ?? null,
      headSha: pull.head?.sha ?? null,
      baseRef: pull.base?.ref ?? null,
      mergeCommitSha: pull.mergeCommit?.oid ?? null,
      requiredChecks: pull.requiredChecks ?? null,
      trustedHeadSha: trustedHeadOf(pull, number, overlay),
    }));
}

// A reference's identity for the parent contradiction check. An absent or null reference has no key,
// so two absent references agree.
function referenceKey(reference) {
  return present(reference) ? qualifiedKey(referenceRepository(reference), numberOf(reference)) : null;
}

function missingEvidenceOf(index, number, item, issue, parentIssueFieldObserved) {
  const entries = [];
  if (!parentIssueFieldObserved) entries.push(`Project item #${number} Parent issue`);
  if (Array.isArray(item?.fields) && !fieldPresent(item, "Linked pull requests")) {
    entries.push(`Project item #${number} Linked pull requests`);
  }
  // The closure judges one group without the whole-snapshot gate, so a linked pull request that
  // pullRequests lacks must hold its group through the record itself.
  for (const pull of itemPullNumbers(index, item)) {
    if (pullFor(index, pull) === null) {
      entries.push(`pull request missing from pullRequests: ${index.repository}#${pull}`);
    }
  }
  if (issue !== null && !Array.isArray(issue.children)) entries.push(`issue #${number} child relationship`);
  if (
    issue !== null &&
    parentIssueFieldObserved &&
    referenceKey(fieldValue(item, "Parent issue")) !== referenceKey(issue.parent)
  ) {
    entries.push(`contradictory parent for issue #${number}`);
  }
  // A settled subtree needs no Project item per sub-issue: each was read and found closed as completed.
  if (issue !== null && Array.isArray(issue.children) && !settledSubIssue(index, number)) {
    for (const child of issue.children.filter((reference) => isTargetReference(reference, index.target))) {
      if (itemFor(index, numberOf(child)) === null) entries.push(`child issue #${numberOf(child)} Project item`);
    }
  }
  return [...new Set(entries)];
}

// An issue is settled when it is closed with a recorded reason, is Done when it is a Project item, and
// every sub-issue it lists is a target-repository issue that is settled too. The top issue must have
// been closed as completed; a sub-issue may also be closed as not planned, which is how a superseded
// child is retired. A sub-issue that is not a Project item is judged by its closed state alone.
// Anything unread (no issue, no child list, a sub-issue of another repository, a cycle, a closed
// issue with no recorded reason) is not settled.
const COMPLETED = new Set(["completed"]);
const SETTLED_SUB_ISSUE_REASONS = new Set(["completed", "not_planned"]);
const NOT_PLANNED = new Set(["not_planned"]);

function settledWith(reasons, index, number, path) {
  const issue = issueFor(index, number);
  if (issue === null || path.includes(number)) return false;
  if (issueState(issue) !== "CLOSED" || !reasons.has(issue.state_reason ?? issue.stateReason)) return false;
  const item = itemFor(index, number);
  if (item !== null && !doneStatus(itemStatus(item))) return false;
  if (!Array.isArray(issue.children)) return false;
  return issue.children.every(
    (child) =>
      isTargetReference(child, index.target) &&
      settledWith(SETTLED_SUB_ISSUE_REASONS, index, numberOf(child), [...path, number]),
  );
}

const settledIssue = (index, number) => settledWith(COMPLETED, index, number, []);
const settledSubIssue = (index, number) => settledWith(SETTLED_SUB_ISSUE_REASONS, index, number, []);
const retiredIssue = (index, number) => settledWith(NOT_PLANNED, index, number, []);

// The Project's Parent issue field decides the parent whenever it is present, even when null, so an
// issue whose own parent disagrees with the field is held instead of read under either parent.
function recordFor(index, number, overlay) {
  const item = itemFor(index, number);
  const issue = issueFor(index, number);
  const parentIssueFieldObserved = fieldPresent(item, "Parent issue");
  const parentReference = parentIssueFieldObserved ? fieldValue(item, "Parent issue") : (issue?.parent ?? null);
  const parentIssueNumber = isTargetReference(parentReference, index.target) ? numberOf(parentReference) : null;
  return {
    key: qualifiedKey(index.repository, number),
    issueNumber: number,
    parentIssueFieldObserved,
    parentIssueNumber,
    parentItemMissing: parentIssueNumber !== null && itemFor(index, parentIssueNumber) === null,
    projectStatus: itemStatus(item),
    settled: settledIssue(index, number),
    settledSub: settledSubIssue(index, number),
    retired: retiredIssue(index, number),
    hasChildren: Array.isArray(issue?.children) && issue.children.length > 0,
    issue: issue === null ? null : issueRecord(number, issue, overlay),
    pullRequests: pullRequestRecords(index, item, overlay),
    relationHolds: relationReasons(index, number),
    missingEvidence: missingEvidenceOf(index, number, item, issue, parentIssueFieldObserved),
  };
}

// With an overlay, the overlay alone supplies each checkpoint and trusted head. A value the snapshot
// carries can have gone stale since it was read, so it must not decide a group the overlay settles.
function buildQueueRecords(index, options = {}) {
  const overlay = options.overlay ?? null;
  return index.itemOrder.map((number) => recordFor(index, number, overlay));
}

function queueAncestry(record, byNumber) {
  const path = [];
  const seen = new Set();
  let current = record;
  while (current) {
    if (seen.has(current.issueNumber)) return { path: [], reasons: ["cyclic parent/child relationship"] };
    seen.add(current.issueNumber);
    path.unshift(current);
    current = byNumber.get(current.parentIssueNumber);
  }
  return { path, reasons: [] };
}

function classifyGroups(records, context) {
  const byNumber = new Map(records.map((record) => [record.issueNumber, record]));
  const independentParents = new Set();
  const groups = new Map();
  records.forEach((record, order) => {
    const { path, reasons } = queueAncestry(record, byNumber);
    let rootIndex = 0;
    for (let index = 1; index < path.length; index += 1) {
      const parent = path[index - 1];
      if (
        parent.projectStatus === "Backlog" &&
        ["Todo", "In Progress", "Done"].includes(path[index].projectStatus) &&
        parent.pullRequests.length === 0 &&
        activeCheckpointOf(parent) !== true
      ) {
        rootIndex = index;
        independentParents.add(parent.issueNumber);
      }
    }
    const root = path[rootIndex] ?? record;
    const rootIssueNumber = rootIndex === 0 ? (root.parentIssueNumber ?? root.issueNumber) : root.issueNumber;
    const ancestors = path.slice(0, rootIndex);
    reasons.push(
      ...recordReasons(ancestors).reasons,
      ...pullRequestReasons(ancestors.flatMap(({ pullRequests }) => pullRequests)),
    );
    const group = groups.get(rootIssueNumber) ?? { rootIssueNumber, records: [], order, ancestorReasons: [] };
    group.records.push(record);
    group.ancestorReasons.push(...reasons);
    groups.set(rootIssueNumber, group);
  });
  return [...groups.values()].map(({ ancestorReasons, ...group }) => {
    const reasons = [...ancestorReasons];
    if (group.records.some(({ issueNumber }) => independentParents.has(issueNumber))) {
      reasons.push("Backlog hierarchy has independent delivery children");
    }
    const judged = group.records.map((record) =>
      record.issueNumber === group.rootIssueNumber && byNumber.has(record.parentIssueNumber)
        ? { ...record, parentIssueNumber: null }
        : record,
    );
    return { ...group, decision: reasons.length > 0 ? hold(reasons) : decideGroup(judged, context) };
  });
}

// A queue group is only the top of a delivery. The closure judges the subtree under a root whatever
// the root's own parent is, so both read one record builder and differ in the root. The closure judges
// completion evidence only: it never applies the queue's date, friction-log, or queue-status checks.
function classifyDelivery(records, rootNumber, context) {
  const root = records.find(({ issueNumber }) => issueNumber === rootNumber);
  if (!root) return null;
  const children = records
    .filter(({ parentIssueNumber }) => parentIssueNumber === rootNumber)
    .map((record) => ({ ...record, orphan: false }));
  // The judgement never reads the root's parent, so its missing Project item (parentItemMissing) cannot hold it.
  const judgedRoot = { ...root, parentIssueNumber: null, parentItemMissing: false };
  const members = [judgedRoot, ...children];
  return { rootIssueNumber: rootNumber, records: members, decision: decideDelivery(members, context) };
}

// Resume In Progress work first, the furthest along (an open pull request) ahead of the rest, then
// start Todo before Backlog. While any root has an unfinished delivery branch, no Todo or Backlog group
// is started, so new work never buries it; In Progress groups still resume.
const NEW_WORK_STATUSES = new Set(["Todo", "Backlog"]);
const NEW_WORK_RANK = { Todo: 2, Backlog: 3 };

function startRank({ status, openPullRequest }) {
  if (status === "In Progress") return openPullRequest ? 0 : 1;
  return NEW_WORK_RANK[status] ?? 4;
}

function startable({ decision }, withheld) {
  if (!decision?.eligible) return false;
  return !(withheld && NEW_WORK_STATUSES.has(decision.status));
}

function selectGroup(groups) {
  const withheld = groups.some(({ decision }) => decision?.unfinishedBranch === true);
  const candidates = groups
    .filter((group) => startable(group, withheld))
    .sort((left, right) => startRank(left.decision) - startRank(right.decision) || left.order - right.order);
  return candidates[0] ?? null;
}

function countRecords(records) {
  const parents = records.filter(({ parentIssueNumber }) => parentIssueNumber === null);
  const children = records.filter(({ parentIssueNumber }) => parentIssueNumber !== null);
  const missingEvidence = records
    .filter(({ parentIssueFieldObserved }) => parentIssueFieldObserved !== true)
    .map(({ issueNumber }) => `Project item #${issueNumber} Parent issue`);
  const counts = {
    rawItems: records.length,
    parentItems: parents.length,
    childItems: children.length,
    parentDoneItems: parents.filter(({ projectStatus }) => doneStatus(projectStatus)).length,
    childDoneItems: children.filter(({ projectStatus }) => doneStatus(projectStatus)).length,
  };
  return {
    ...counts,
    balanced: missingEvidence.length === 0 && counts.rawItems === counts.parentItems + counts.childItems,
    missingEvidence,
  };
}

// A record without repository identity cannot be named as owner/name#N, so it is named by what it is.
function subjectOf({ kind, number, itemId }) {
  const shown = number ?? "?";
  if (kind === "item") return itemId === null ? `Project item #${shown}` : `Project item ${itemId}`;
  if (kind === "issue") return `issue #${shown}`;
  return `pull request #${shown}`;
}

// A duplicate has no record to name, so it is named by its issue in the target repository.
function problemCause(index, { issue, reasons, record }) {
  const [reason] = reasons;
  return record === undefined ? `${reason}: ${index.repository}#${issue}` : `${reason}: ${subjectOf(record)}`;
}

// Each cause names one reason the whole snapshot cannot be classified. While any exists, no group is
// classified, so no decision rests on partial or ambiguous input.
function snapshotCauses(index) {
  const causes = index.repository === null ? ["target repository identity missing"] : [];
  causes.push(...index.problems.map((problem) => problemCause(index, problem)));
  causes.push(
    ...index.itemOrder
      .filter((number) => issueFor(index, number) === null)
      .map((number) => `issue missing from issues: ${index.repository}#${number}`),
  );
  for (const number of index.itemOrder) {
    for (const pull of itemPullNumbers(index, itemFor(index, number))) {
      if (pullFor(index, pull) === null)
        causes.push(`pull request missing from pullRequests: ${index.repository}#${pull}`);
    }
  }
  return [...new Set(causes)];
}

function classifyQueue(snapshot, { today }) {
  const index = indexSnapshot(snapshot);
  const records = buildQueueRecords(index);
  const counts = countRecords(records);
  const causes = snapshotCauses(index);
  const context = {
    repository: index.repository,
    defaultBranch: index.defaultBranch,
    today,
    branches: branchesOf(snapshot),
  };
  const groups = causes.length > 0 ? [] : classifyGroups(records, context);
  const selected = selectGroup(groups);
  const missingEvidence = [
    ...new Set([...causes, ...counts.missingEvidence, ...records.flatMap((record) => evidenceOf(record))]),
  ];
  return { groups, selected, counts, missingEvidence };
}

export { buildQueueRecords, classifyDelivery, classifyQueue };
