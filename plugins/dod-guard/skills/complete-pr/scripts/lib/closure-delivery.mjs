// Owns the judgement of each delivery against the snapshot the caller read, and the snapshot
// annotation taken from the same completion records. Pure: it reads no provider and writes
// nothing. A close is planned only for a delivery that verifies against live readback and the
// queue's own merged predicate, so cleanup and selection can never disagree.
import { defaultQueueDecision } from "../../../goal-sdlc/scripts/lib/queue-readback.mjs";
import { parseCompletionRecord } from "./closure-records.mjs";

function numberOf(value) {
  const number = Number(value?.number ?? value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function fieldValue(item, name) {
  return (Array.isArray(item?.fields) ? item.fields : []).find((field) => field?.name === name)?.value;
}

function itemStatus(item) {
  const value = fieldValue(item, "Status");
  return typeof value === "string" ? value : value?.name ?? null;
}

function itemPullNumbers(item) {
  const value = fieldValue(item, "Linked pull requests");
  return (Array.isArray(value) ? value : []).map(numberOf).filter((number) => number !== null);
}

function indexSnapshot(snapshot) {
  const byNumber = (records) => new Map((records ?? []).map((record) => [numberOf(record), record]));
  return {
    repository: snapshot?.repository ?? null,
    defaultBranch: snapshot?.defaultBranch ?? null,
    items: new Map((snapshot?.items ?? []).map((item) => [numberOf(item?.content), item])),
    issues: byNumber(snapshot?.issues),
    pulls: byNumber(snapshot?.pullRequests),
    order: (snapshot?.issues ?? []).map(numberOf).filter((number) => number !== null),
  };
}

// Null means the sub-issue list was never read. No rule may then treat the issue
// as childless, or as having only the children that point back at it.
function childNumbers(index, number) {
  const children = index.issues.get(number)?.children;
  if (!Array.isArray(children)) return null;
  const listed = children.map(numberOf);
  const pointing = index.order.filter((child) => numberOf(index.issues.get(child)?.parent) === number);
  return [...new Set([...listed, ...pointing].filter((child) => child !== null))];
}

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
  const issue = index.issues.get(number) ?? null;
  const item = index.items.get(number);
  const pullNumbers = itemPullNumbers(item);
  const pulls = pullNumbers.map((pull) => index.pulls.get(pull)).filter(Boolean);
  const missing = pullNumbers.filter((pull) => !index.pulls.has(pull)).map((pull) => `pull request #${pull}`);
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
  const pull = index.pulls.get(record.pullRequest);
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
  const parsed = parseCompletionRecord(index.issues.get(number)?.comments);
  if (parsed.error) return { status: "unverified", reasons: [parsed.error] };
  if (!parsed.record) return { status: "unverified", reasons: ["completion evidence missing"] };
  const { record } = parsed;
  const mismatches = liveMismatches(index, record);
  if (record.pendingRows.length > 0) {
    return {
      status: "merged-pending",
      record,
      reasons: [`acceptance rows pending: ${record.pendingRows.join(", ")}`, ...mismatches],
    };
  }
  if (mismatches.length > 0) return { status: "unverified", record, reasons: mismatches };
  const children = childNumbers(index, number);
  if (children === null) return { status: "unverified", record, reasons: ["sub-issue list missing"] };
  const records = [number, ...children].map((issue) =>
    queueRecord(index, issue, issue === number ? null : number, record),
  );
  const decision = defaultQueueDecision(records, { repository: index.repository, defaultBranch: index.defaultBranch });
  if (decision.kind === "complete") return { status: "verified", record, reasons: [] };
  return { status: "unverified", record, reasons: decision.reasons };
}

function isOpen(issue) {
  return String(issue?.state ?? "").toLowerCase() === "open";
}

// Returns a copy of a select-next snapshot whose `activeCheckpoint` and
// `trustedHeadSha` come from the completion records: an issue whose record
// leaves no row pending gets `activeCheckpoint: false`, a merged-pending one
// loses any stale value, and the recorded pull request gets the trusted head.
// Two records that disagree on one pull request's head leave it untrusted.
function annotateSnapshot(snapshot) {
  const copy = structuredClone(snapshot);
  const heads = new Map();
  for (const issue of copy.issues ?? []) {
    const { record } = parseCompletionRecord(issue.comments);
    if (!record) continue;
    if (record.pendingRows.length === 0) issue.activeCheckpoint = false;
    else delete issue.activeCheckpoint;
    const known = heads.get(record.pullRequest);
    heads.set(
      record.pullRequest,
      known === undefined || known === record.trustedHeadSha ? record.trustedHeadSha : null,
    );
  }
  for (const pull of copy.pullRequests ?? []) {
    if (!heads.has(numberOf(pull))) continue;
    const head = heads.get(numberOf(pull));
    if (head) pull.trustedHeadSha = head;
    else delete pull.trustedHeadSha;
  }
  return copy;
}

export {
  annotateSnapshot,
  childNumbers,
  indexSnapshot,
  isOpen,
  itemPullNumbers,
  itemStatus,
  judgeDelivery,
  numberOf,
};
