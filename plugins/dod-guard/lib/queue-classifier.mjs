// The one queue classifier that select-next and the closure judgement share. It keys every Project
// item, issue, and pull request by owner/name#number, so no record from another repository can stand
// in for a target record. It reads no provider and no clock: the caller passes the snapshot and the
// local date.

import { collectingFrictionLog } from "./friction-log.mjs";
import {
  fieldValue,
  indexSnapshot,
  isTargetReference,
  issueFor,
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
  if (!Array.isArray(checks) || checks.length === 0) return { complete: false, reason: "required checks missing or empty" };
  const invalid = checks.filter((check) => !PASSING_CHECK_BUCKETS.has(checkBucket(check)));
  if (invalid.length > 0) return { complete: false, reason: "required checks are incomplete or failed" };
  if (value && !Array.isArray(value) && value.complete === false) return { complete: false, reason: "required checks are incomplete" };
  return { complete: true };
}

// Only a head that a recorded SHA names is trusted. An empty or missing SHA is no evidence at all.
function trustedHead(pullRequest) {
  const { trustedHeadSha, headSha } = pullRequest;
  return typeof trustedHeadSha === "string" && trustedHeadSha !== "" && trustedHeadSha === headSha;
}

// GitHub resolves owner/name case-insensitively, so the comparison must do the same.
function sameRepository(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function mergedEvidenceReasons(records, context, mergedPullRequests) {
  const reasons = [];
  const { repository, defaultBranch } = context;
  if (!repository) reasons.push("target repository identity missing");
  if (!defaultBranch) reasons.push("default base branch missing");
  if (mergedPullRequests.length !== 1) reasons.push("merged delivery relationship is missing or duplicated");
  for (const pullRequest of mergedPullRequests) {
    if (!sameRepository(pullRequest.headRepository, repository)) reasons.push("pull request head repository is not the target repository");
    if (!defaultBranch || pullRequest.baseRef !== defaultBranch) reasons.push("pull request base is not the default branch");
    if (!pullRequest.headRef || !pullRequest.headSha) reasons.push("trusted pull request head is missing");
    if (!trustedHead(pullRequest)) reasons.push("trusted pull request head evidence is missing or stale");
    if (!pullRequest.mergeCommitSha) reasons.push("merge commit is missing");
    const checks = requiredChecksComplete(pullRequest.requiredChecks);
    if (!checks.complete) reasons.push(checks.reason);
  }
  for (const record of records) {
    if (!record.issue || issueState(record.issue) !== "CLOSED") reasons.push(`issue #${record.issueNumber} is not closed`);
    if (record.projectStatus !== "Done") reasons.push(`Project item #${record.issueNumber} is not Done`);
    if (activeCheckpointOf(record) !== false) reasons.push(`active checkpoint for issue #${record.issueNumber} is not explicitly false`);
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

function hold(reasons) {
  return { kind: "hold", eligible: false, reasons: [...new Set(reasons)] };
}

// A record's entries, with its parent-item gap rendered from its flag at the position the text always
// had: before the first contradictory-parent or child entry, otherwise last.
function evidenceOf(record) {
  const entries = [...(record.missingEvidence ?? [])];
  if (record.parentItemMissing) {
    const entry = `parent issue #${record.parentIssueNumber} Project item`;
    const at = entries.findIndex((text) => text.startsWith("contradictory parent for issue #") || text.startsWith("child issue #"));
    if (at === -1) {
      entries.push(entry);
    } else {
      entries.splice(at, 0, entry);
    }
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
  const orphaned = (record) => record.parentIssueNumber !== null && (record.orphan || !recordNumbers.has(record.parentIssueNumber));
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
  const pullRequests = records.flatMap(({ pullRequests: linked }) => linked ?? []);
  reasons.push(...pullRequestReasons(pullRequests));
  const merged = pullRequests.filter(mergedPullRequest);
  if (merged.length > 0) {
    reasons.push(...mergedEvidenceReasons(records, context, merged));
  }
  return { reasons, uniqueStatuses, merged };
}

// A merged delivery is judged by its completion evidence alone, so it is either complete or held and
// is never queued as work.
function decideGroup(records, context) {
  if (!Array.isArray(records) || records.length === 0) return hold(["delivery record missing"]);
  const { reasons, uniqueStatuses, merged } = groupEvidence(records, context);
  if (merged.length > 0) {
    return mergedDecision(reasons);
  }

  const resumable = resumableDecision(reasons, records);
  if (resumable) return resumable;
  if (reasons.length > 0) return hold(reasons);
  // Without a date the friction log cannot be read, so the group is held rather than assumed clear.
  if (typeof context.today !== "string") return hold(["local date missing"]);
  if (collectingFrictionLog(records, context.today)) return hold(["friction log still collecting entries"]);
  if (uniqueStatuses.length !== 1 || !["Todo", "Backlog"].includes(uniqueStatuses[0])) {
    return hold(["Project status is not a queue status"]);
  }
  if (records.some((record) => record.issue === null)) return hold(["issue readback missing"]);
  return { kind: "eligible", eligible: true, status: uniqueStatuses[0], reasons: [] };
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

function issueRecord(number, issue, overlay) {
  const checkpoint = overlay ? overlay.checkpoints.get(number) : issue.activeCheckpoint;
  return {
    number,
    state: issue.state,
    title: issue.title ?? null,
    activeCheckpoint: typeof checkpoint === "boolean" ? checkpoint : null,
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
  if (issue !== null && parentIssueFieldObserved && referenceKey(fieldValue(item, "Parent issue")) !== referenceKey(issue.parent)) {
    entries.push(`contradictory parent for issue #${number}`);
  }
  if (issue !== null && Array.isArray(issue.children)) {
    for (const child of issue.children.filter((reference) => isTargetReference(reference, index.target))) {
      if (itemFor(index, numberOf(child)) === null) entries.push(`child issue #${numberOf(child)} Project item`);
    }
  }
  return [...new Set(entries)];
}

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

// Groups each record under its root issue, so a child is never queued apart from its parent. A record
// whose parent is not in the list is an orphan, and its group is held rather than dropped.
function classifyGroups(records, context) {
  const marked = records.map((record) => ({
    ...record,
    orphan: record.parentIssueNumber !== null && !records.some(({ issueNumber }) => issueNumber === record.parentIssueNumber),
  }));
  const groups = new Map();
  marked.forEach((record, order) => {
    const rootIssueNumber = record.parentIssueNumber ?? record.issueNumber;
    const group = groups.get(rootIssueNumber) ?? { rootIssueNumber, records: [], order };
    group.records.push(record);
    groups.set(rootIssueNumber, group);
  });
  return [...groups.values()].map((group) => ({ ...group, decision: decideGroup(group.records, context) }));
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
// start Todo before Backlog.
function selectGroup(groups) {
  const rank = ({ status, openPullRequest }) => ({ "In Progress": openPullRequest ? 0 : 1, Todo: 2, Backlog: 3 })[status] ?? 4;
  const candidates = groups
    .filter(({ decision }) => decision?.eligible)
    .sort((left, right) => rank(left.decision) - rank(right.decision) || left.order - right.order);
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
  if (kind === "item") return itemId !== null ? `Project item ${itemId}` : `Project item #${shown}`;
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
  causes.push(...index.itemOrder
    .filter((number) => issueFor(index, number) === null)
    .map((number) => `issue missing from issues: ${index.repository}#${number}`));
  for (const number of index.itemOrder) {
    for (const pull of itemPullNumbers(index, itemFor(index, number))) {
      if (pullFor(index, pull) === null) causes.push(`pull request missing from pullRequests: ${index.repository}#${pull}`);
    }
  }
  return [...new Set(causes)];
}

function classifyQueue(snapshot, { today }) {
  const index = indexSnapshot(snapshot);
  const records = buildQueueRecords(index);
  const counts = countRecords(records);
  const causes = snapshotCauses(index);
  const context = { repository: index.repository, defaultBranch: index.defaultBranch, today };
  const groups = causes.length > 0 ? [] : classifyGroups(records, context);
  const selected = selectGroup(groups);
  const missingEvidence = [
    ...new Set([...causes, ...counts.missingEvidence, ...records.flatMap((record) => evidenceOf(record))]),
  ];
  return { groups, selected, counts, missingEvidence };
}

export {
  buildQueueRecords,
  classifyDelivery,
  classifyQueue,
};
