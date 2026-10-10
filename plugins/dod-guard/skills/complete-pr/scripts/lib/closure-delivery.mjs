// Owns the judgement of each delivery against the snapshot the caller read, and the snapshot
// annotation taken from the same completion records. Pure: it reads no provider and writes
// nothing. A close is planned only for a delivery that verifies against live readback and the
// queue's own merged predicate, so cleanup and selection can never disagree.

import { defaultQueueDecision } from "../../../goal-sdlc/scripts/lib/queue-readback.mjs";
import { parseCompletionRecord } from "./closure-records.mjs";
import {
  childNumbers,
  fieldValue,
  indexSnapshot,
  isTargetReference,
  isTargetRepository,
  issueFor,
  itemFor,
  itemPullNumbers,
  itemStatus,
  numberOf,
  present,
  pullFor,
  recordRepository,
  relationReasons,
} from "./closure-index.mjs";

function queuePull(pull, record) {
  return {
    number: numberOf(pull),
    state: pull.state,
    mergedAt: pull.mergedAt ?? null,
    headRepository: pull.head?.repository ?? null,
    headRef: pull.head?.ref ?? null,
    headSha: pull.head?.sha ?? null,
    baseRef: pull.base?.ref ?? null,
    mergeCommitSha: pull.mergeCommit?.oid ?? null,
    requiredChecks: pull.requiredChecks,
    // The trusted head comes from the completion record only, never from the
    // readback it is compared against.
    trustedHeadSha: numberOf(pull) === record.pullRequest ? record.trustedHeadSha : null,
  };
}

// An issue's checkpoint is finished only when its own completion record names
// the same delivery and leaves no acceptance row pending.
function checkpointFinished(issue, record) {
  const own = parseCompletionRecord(issue?.comments).record;
  return Boolean(own && own.pullRequest === record.pullRequest && own.pendingRows.length === 0);
}

function queueRecord(index, number, parentNumber, record) {
  const issue = issueFor(index, number);
  const item = itemFor(index, number);
  const pullNumbers = itemPullNumbers(index, item);
  const pulls = pullNumbers.map((pull) => pullFor(index, pull)).filter(Boolean);
  const missing = pullNumbers.filter((pull) => pullFor(index, pull) === null).map((pull) => `pull request #${pull}`);
  return {
    issueNumber: number,
    parentIssueNumber: parentNumber,
    issue: issue && { state: issue.state, ...(checkpointFinished(issue, record) ? { activeCheckpoint: false } : {}) },
    projectStatus: itemStatus(item),
    pullRequests: pulls.map((pull) => queuePull(pull, record)),
    missingEvidence: item ? missing : [...missing, `Project item #${number}`],
    staleRelationships: [],
  };
}

function liveMismatches(index, record) {
  const pull = pullFor(index, record.pullRequest);
  if (!pull) return [`pull request #${record.pullRequest} readback missing`];
  const reasons = [];
  if (pull.mergeCommit?.oid !== record.mergeCommit) reasons.push("merge commit differs from live readback");
  if (pull.head?.sha !== record.trustedHeadSha) reasons.push("trusted head differs from live readback");
  if (pull.base?.ref !== index.defaultBranch) reasons.push("pull request base is not the default branch");
  if (record.requiredChecks !== "pass") reasons.push(`completion record checks are ${record.requiredChecks}`);
  return reasons;
}

// Judges the delivery whose group root is `number`: the root and its children,
// as the queue groups them.
function judgeDelivery(index, number) {
  const parsed = parseCompletionRecord(issueFor(index, number)?.comments);
  if (parsed.error) return { status: "unverified", reasons: [parsed.error] };
  if (!parsed.record) return { status: "unverified", reasons: ["completion evidence missing"] };
  const { record } = parsed;
  const listed = childNumbers(index, number);
  // A delivery is never verified across repositories, so a relation of the root or of any of its
  // target children settles the verdict before any readback is compared.
  const relations = [...new Set([number, ...(listed ?? [])].flatMap((issue) => relationReasons(index, issue)))];
  if (relations.length > 0) return { status: "unverified", record, reasons: relations };
  const mismatches = liveMismatches(index, record);
  if (record.pendingRows.length > 0) {
    return {
      status: "merged-pending",
      record,
      reasons: [`acceptance rows pending: ${record.pendingRows.join(", ")}`, ...mismatches],
    };
  }
  if (mismatches.length > 0) return { status: "unverified", record, reasons: mismatches };
  if (listed === null) return { status: "unverified", record, reasons: ["sub-issue list missing"] };
  const records = [number, ...listed].map((issue) =>
    queueRecord(index, issue, issue === number ? null : number, record),
  );
  const decision = defaultQueueDecision(records, { repository: index.repository, defaultBranch: index.defaultBranch });
  if (decision.kind === "complete") return { status: "verified", record, reasons: [] };
  return { status: "unverified", record, reasons: decision.reasons };
}

function isOpen(issue) {
  return String(issue?.state ?? "").toLowerCase() === "open";
}

// select-next (goal-sdlc/scripts/select-next.mjs) groups by bare issue number, so a foreign child list, or a foreign
// parent under a Parent issue value, is removed here; select-next then holds the group instead of joining a
// same-numbered target issue, and holds a healthy target group as collateral; a null Parent issue field is left alone
// because removing the parent would make the issue look like a standalone root; delete this when #856 keys select-next
// by repository, and #829 splits queue-readback.mjs into a pure classifier.
function dropForeignRelations(issue, target, item) {
  if (Array.isArray(issue.children) && issue.children.some((child) => !isTargetReference(child, target))) {
    delete issue.children;
  }
  const fieldSet = item !== null && present(fieldValue(item, "Parent issue"));
  if (fieldSet && present(issue.parent) && !isTargetReference(issue.parent, target)) delete issue.parent;
}

// Returns a copy of a select-next snapshot whose `activeCheckpoint` and
// `trustedHeadSha` come from the completion records of the target repository: an issue whose
// record leaves no row pending gets `activeCheckpoint: false`, a merged-pending one
// loses any stale value, and the recorded pull request gets the trusted head.
// Two records that disagree on one pull request's head leave it untrusted. Target issues also
// lose a child list naming a foreign issue, and lose a foreign parent when their Project item
// carries a Parent issue value (see dropForeignRelations). Records from another repository, or
// with no repository, are copied unchanged.
function annotateSnapshot(snapshot) {
  const copy = structuredClone(snapshot);
  // Items are never edited here, so the index built from the copy finds each issue's Project item
  // as the caller sent it.
  const index = indexSnapshot(copy);
  const target = index.target;
  const heads = new Map();
  for (const issue of copy.issues ?? []) {
    if (!isTargetRepository(recordRepository(issue), target)) continue;
    const { record } = parseCompletionRecord(issue.comments);
    if (record) {
      if (record.pendingRows.length === 0) issue.activeCheckpoint = false;
      else delete issue.activeCheckpoint;
      const known = heads.get(record.pullRequest);
      heads.set(
        record.pullRequest,
        known === undefined || known === record.trustedHeadSha ? record.trustedHeadSha : null,
      );
    }
    dropForeignRelations(issue, target, itemFor(index, numberOf(issue)));
  }
  for (const pull of copy.pullRequests ?? []) {
    if (!isTargetRepository(recordRepository(pull), target) || !heads.has(numberOf(pull))) continue;
    const head = heads.get(numberOf(pull));
    if (head) pull.trustedHeadSha = head;
    else delete pull.trustedHeadSha;
  }
  return copy;
}

export { annotateSnapshot, isOpen, judgeDelivery };
