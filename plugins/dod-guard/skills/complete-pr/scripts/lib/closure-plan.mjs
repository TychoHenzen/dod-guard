// Plans which issues to close from a queue snapshot the caller already read.
// Pure: it reads no provider and writes nothing. A close is planned only for a
// delivery that verifies against live readback and the queue's own merged
// predicate, so cleanup and selection can never disagree.
import { defaultQueueDecision } from "../../../goal-sdlc/scripts/lib/queue-readback.mjs";
import { parseCompletionRecord, parseSupersedes, renderClosureEvidence } from "./closure-records.mjs";

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

function childNumbers(index, number) {
  const listed = (index.issues.get(number)?.children ?? []).map(numberOf);
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
    return { status: "merged-pending", record, reasons: [`acceptance rows pending: ${record.pendingRows.join(", ")}`, ...mismatches] };
  }
  if (mismatches.length > 0) return { status: "unverified", record, reasons: mismatches };
  const records = [number, ...childNumbers(index, number)].map((issue) =>
    queueRecord(index, issue, issue === number ? null : number, record),
  );
  const decision = defaultQueueDecision(records, { repository: index.repository, defaultBranch: index.defaultBranch });
  if (decision.kind === "complete") return { status: "verified", record, reasons: [] };
  return { status: "unverified", record, reasons: decision.reasons };
}

function createContext(snapshot) {
  const index = indexSnapshot(snapshot);
  const deliveries = new Map();
  const delivery = (number) => {
    if (!deliveries.has(number)) deliveries.set(number, judgeDelivery(index, number));
    return deliveries.get(number);
  };
  const roots = new Map();
  const rootErrors = [];
  for (const number of index.order) {
    const parsed = parseSupersedes(index.issues.get(number)?.body, index.repository);
    if (parsed.error) rootErrors.push({ issue: number, reasons: [parsed.error] });
    else if (parsed.numbers.length > 0) roots.set(number, parsed.numbers);
  }
  const rootsOf = (original) => [...roots].filter(([, numbers]) => numbers.includes(original)).map(([root]) => root);
  return { index, delivery, roots, rootErrors, rootsOf, closes: [], holds: [...rootErrors] };
}

function isOpen(issue) {
  return String(issue?.state ?? "").toLowerCase() === "open";
}

function originalHold(context, original) {
  const issue = context.index.issues.get(original);
  if (!issue) return [`issue #${original} readback missing`];
  if (!isOpen(issue)) return null;
  const roots = context.rootsOf(original);
  if (roots.length > 1) return [`superseded by more than one root: ${roots.map((root) => `#${root}`).join(", ")}`];
  const judged = context.delivery(roots[0]);
  if (judged.status !== "verified") return judged.reasons.map((reason) => `root #${roots[0]} ${judged.status}: ${reason}`);
  if (!context.index.items.get(original)?.id) return [`Project item #${original} missing`];
  return [];
}

function planReplacedOriginal(context, root, original) {
  if (context.closes.some((close) => close.issue === original)) return;
  if (context.holds.some((hold) => hold.issue === original)) return;
  const reasons = originalHold(context, original);
  if (reasons === null) return;
  if (reasons.length > 0) {
    context.holds.push({ issue: original, reasons });
    return;
  }
  const { record } = context.delivery(root);
  const evidence = [
    `Superseded by #${root}, delivered by pull request #${record.pullRequest} at merge commit ${record.mergeCommit}.`,
    `The completion evidence on #${root} matches the live pull request readback, and the queue decision for #${root} is complete.`,
  ];
  context.closes.push({
    issue: original,
    itemId: context.index.items.get(original).id,
    stateReason: "completed",
    rule: "replaced-original",
    root,
    pullRequest: record.pullRequest,
    mergeCommit: record.mergeCommit,
    trustedHeadSha: record.trustedHeadSha,
    comment: renderClosureEvidence({ issue: original, stateReason: "completed", evidence }),
  });
}

function deliverySummaries(context) {
  return [...context.roots.keys()].map((root) => {
    const { status, record, reasons } = context.delivery(root);
    return { root, status, pullRequest: record?.pullRequest ?? null, mergeCommit: record?.mergeCommit ?? null, reasons };
  });
}

function planClosures(snapshot) {
  const context = createContext(snapshot);
  for (const [root, originals] of context.roots) {
    for (const original of originals) planReplacedOriginal(context, root, original);
  }
  return {
    repository: context.index.repository,
    closes: context.closes,
    holds: context.holds,
    deliveries: deliverySummaries(context),
  };
}

export { planClosures };
