// Plans which issues to close from a queue snapshot the caller already read.
// Pure: it reads no provider and writes nothing. A close is planned only for a
// delivery that verifies against live readback and the queue's own merged
// predicate, so cleanup and selection can never disagree.
import { defaultQueueDecision } from "../../../goal-sdlc/scripts/lib/queue-readback.mjs";
import {
  CLOSURE_MARKER,
  markdownSection,
  markedComments,
  parseCompletionRecord,
  parseSupersedes,
  renderClosureEvidence,
} from "./closure-records.mjs";

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
    return { status: "merged-pending", record, reasons: [`acceptance rows pending: ${record.pendingRows.join(", ")}`, ...mismatches] };
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

const PARENT_WALK_LIMIT = 5;

// ASSUMPTION: an unchecked criterion that names one of the issue's own
// sub-issues as #N belongs to that sub-issue's delivery, so it does not hold
// the parent; any other unchecked criterion is the parent's own scope.
function unmappedCriteria(issue, children) {
  return markdownSection(issue?.body, "Acceptance criteria")
    .split("\n")
    .filter((line) => /^\s*- \[ \]/.test(line))
    .filter((line) => !children.some((child) => new RegExp(`#${child}\\b`).test(line)))
    .map((line) => line.replace(/^\s*- \[ \]\s*/, "").trim());
}

function planned(context, number) {
  return context.closes.some((close) => close.issue === number);
}

function prefixed(judged) {
  return judged.reasons.map((reason) => `${judged.status}: ${reason}`);
}

// The delivery group an issue's own completion record belongs to: its parent's
// when the parent recorded the same pull request, otherwise its own.
function recordGroup(context, number, record) {
  const parent = numberOf(context.index.issues.get(number)?.parent);
  const parentRecord = parent === null ? null : parseCompletionRecord(context.index.issues.get(parent)?.comments).record;
  return parentRecord?.pullRequest === record.pullRequest ? parent : number;
}

function hasClosureEvidence(issue) {
  return markedComments(issue?.comments, CLOSURE_MARKER).length > 0;
}

// Whether an issue's close is backed by evidence the helper can verify now: a
// verified root that supersedes it, its own verified delivery, or a closure
// evidence comment whose rule still holds. Purpose "justified" asks whether the
// close itself stands: a refinement may close a not_planned hierarchy record
// before its moved delivery lands. Purpose "delivered" asks whether a parent may
// count the issue as settled for its own completed close, which must wait for
// that delivery.
function closureEvidence(context, number, { seen = new Set(), purpose = "justified" } = {}) {
  if (seen.has(number)) return { verified: false, missing: ["sub-issue relationship cycle"] };
  seen.add(number);
  const roots = context.rootsOf(number);
  if (roots.length > 0) {
    const judged = roots.map((root) => [root, context.delivery(root)]);
    if (roots.length === 1 && judged[0][1].status === "verified") return { verified: true };
    return { verified: false, missing: judged.flatMap(([root, value]) => prefixed(value).map((reason) => `root #${root} ${reason}`)) };
  }
  const issue = context.index.issues.get(number);
  const own = parseCompletionRecord(issue?.comments);
  if (own.error) return { verified: false, missing: [own.error] };
  if (own.record) {
    const judged = context.delivery(recordGroup(context, number, own.record));
    return judged.status === "verified" ? { verified: true } : { verified: false, missing: prefixed(judged) };
  }
  if (hasClosureEvidence(issue)) {
    const hierarchy = issue.state_reason === "not_planned" && purpose === "justified";
    const rule = hierarchy ? hierarchyReasons : parentReasons;
    const missing = rule(context, number, seen);
    return { verified: missing.length === 0, missing };
  }
  return { verified: false, missing: ["completion evidence missing"] };
}

function childReason(context, child, seen) {
  if (planned(context, child)) return null;
  const hold = context.holds.find((entry) => entry.issue === child);
  if (hold) return `child #${child} held: ${hold.reasons.join("; ")}`;
  const issue = context.index.issues.get(child);
  if (!issue) return `child #${child} readback missing`;
  if (isOpen(issue)) return `child #${child} is open`;
  const evidence = closureEvidence(context, child, { seen, purpose: "delivered" });
  return evidence.verified ? null : `child #${child} closed without verified evidence: ${evidence.missing.join("; ")}`;
}

// The preconditions both kinds of parent close share, kept in one place so a rule
// added for one kind cannot silently miss the other. A result without `children`
// carries only the reasons the parent cannot be judged.
function recordBase(context, number) {
  const issue = context.index.issues.get(number);
  if (!issue) return { reasons: [`issue #${number} readback missing`] };
  const children = childNumbers(context.index, number);
  if (children === null) return { reasons: ["sub-issue list missing"] };
  if (children.length === 0) return { reasons: ["has no sub-issues"] };
  const reasons = unmappedCriteria(issue, children).map(
    (text) => `unchecked acceptance criterion not mapped to a sub-issue: ${text}`,
  );
  return { issue, children, reasons };
}

function parentReasons(context, number, seen = new Set([number])) {
  const base = recordBase(context, number);
  if (!base.children) return base.reasons;
  const reasons = base.children.map((child) => childReason(context, child, new Set(seen))).filter(Boolean);
  const pulls = itemPullNumbers(context.index.items.get(number));
  reasons.push(...pulls.filter((pull) => isOpen(context.index.pulls.get(pull))).map((pull) => `open linked pull request #${pull}`));
  reasons.push(...base.reasons);
  return reasons;
}

// A pure hierarchy record owns no delivery of its own: no linked pull request,
// no unchecked criterion outside its sub-issues, and every sub-issue either
// settled or named by an existing replacement root's supersedes record.
function hierarchyReasons(context, number, seen = new Set([number])) {
  const base = recordBase(context, number);
  if (!base.children) return base.reasons;
  const reasons = itemPullNumbers(context.index.items.get(number)).map((pull) => `linked pull request #${pull}`);
  reasons.push(...base.reasons);
  for (const child of base.children) {
    if (context.rootsOf(child).length > 0) continue;
    const reason = childReason(context, child, new Set(seen));
    if (reason) reasons.push(`${reason}, and no replacement root supersedes it`);
  }
  return reasons;
}

function planHierarchy(context, number) {
  const issue = context.index.issues.get(number);
  const reasons = issue && !isOpen(issue) ? ["issue is already closed"] : hierarchyReasons(context, number);
  if (issue && !context.index.items.get(number)?.id) reasons.push(`Project item #${number} missing`);
  if (reasons.length > 0) {
    context.holds.push({ issue: number, reasons });
    return;
  }
  const children = childNumbers(context.index, number);
  const moved = children.flatMap((child) => context.rootsOf(child).map((root) => `#${root} (for #${child})`));
  const evidence = [
    "Pure hierarchy record: no linked pull request and no unchecked acceptance criterion outside a sub-issue.",
    moved.length > 0 ? `Delivery moved to replacement roots: ${moved.join(", ")}.` : "Every sub-issue is closed with verified evidence.",
  ];
  context.closes.push({
    issue: number,
    itemId: context.index.items.get(number).id,
    stateReason: "not_planned",
    rule: "hierarchy",
    children,
    comment: renderClosureEvidence({ issue: number, stateReason: "not_planned", evidence }),
  });
}

function parentClose(context, parent) {
  const children = childNumbers(context.index, parent);
  const evidence = [
    `Every sub-issue is closed with verified evidence or superseded by a verified root: ${children.map((child) => `#${child}`).join(", ")}.`,
    "No open linked pull request and no unchecked acceptance criterion outside a sub-issue remain.",
  ];
  return {
    issue: parent,
    itemId: context.index.items.get(parent).id,
    stateReason: "completed",
    rule: "parent",
    children,
    comment: renderClosureEvidence({ issue: parent, stateReason: "completed", evidence }),
  };
}

// Walks upward from every planned close and every closed issue, closing each open
// parent whose sub-issues are all settled. A walk stops at the first parent that
// does not qualify, or after PARENT_WALK_LIMIT levels. Passes repeat until one adds
// no close: a close that a later seed finds can settle a parent an earlier seed held.
function walkParents(context) {
  const seeds = [
    ...context.closes.map(({ issue }) => issue),
    ...context.index.order.filter((number) => !isOpen(context.index.issues.get(number))),
  ];
  let holds = [];
  let added = true;
  while (added) {
    const before = context.closes.length;
    holds = walkPass(context, seeds);
    added = context.closes.length > before;
  }
  context.holds.push(...holds);
}

// One walk from each seed. Holds are returned, not recorded, because a later pass may
// close the parent a hold names, so only the last pass's holds survive. A planned
// parent is stepped through and still counts toward the level limit, which bounds the
// walk even around a parent cycle.
function walkPass(context, seeds) {
  const holds = [];
  const held = new Set();
  const hold = (parent, reasons) => {
    held.add(parent);
    holds.push({ issue: parent, reasons });
  };
  for (const seed of seeds) {
    let current = seed;
    for (let level = 1; ; level += 1) {
      const parent = numberOf(context.index.issues.get(current)?.parent);
      if (parent === null) break;
      const issue = context.index.issues.get(parent);
      if (issue && !isOpen(issue)) break;
      if (level > PARENT_WALK_LIMIT) {
        if (!held.has(parent)) hold(parent, [`parent walk stopped after ${PARENT_WALK_LIMIT} levels`]);
        break;
      }
      if (planned(context, parent)) {
        current = parent;
        continue;
      }
      if (held.has(parent)) break;
      const reasons = parentReasons(context, parent);
      if (issue && !context.index.items.get(parent)?.id) reasons.push(`Project item #${parent} missing`);
      if (reasons.length > 0) {
        hold(parent, reasons);
        break;
      }
      context.closes.push(parentClose(context, parent));
      current = parent;
    }
  }
  return holds;
}

// Closed or Done records whose close has no verified evidence are reported
// only: reopening or editing them would override an owner's decision.
function unverifiedClosed(context) {
  const reports = [];
  for (const number of context.index.order) {
    if (planned(context, number)) continue;
    const done = itemStatus(context.index.items.get(number)) === "Done";
    if (isOpen(context.index.issues.get(number)) && !done) continue;
    const evidence = closureEvidence(context, number);
    if (!evidence.verified) reports.push({ issue: number, kind: "unverified-closed", missing: evidence.missing });
  }
  return reports;
}

function deliverySummaries(context) {
  return [...context.roots.keys()].map((root) => {
    const { status, record, reasons } = context.delivery(root);
    return { root, status, pullRequest: record?.pullRequest ?? null, mergeCommit: record?.mergeCommit ?? null, reasons };
  });
}

// options.hierarchy names one issue that refinement asks to close as a pure
// hierarchy record; without it the plan never closes an issue as not_planned.
function planClosures(snapshot, { hierarchy = null } = {}) {
  const context = createContext(snapshot);
  for (const [root, originals] of context.roots) {
    for (const original of originals) planReplacedOriginal(context, root, original);
  }
  if (hierarchy !== null && !planned(context, hierarchy)) planHierarchy(context, hierarchy);
  walkParents(context);
  return {
    repository: context.index.repository,
    closes: context.closes,
    holds: context.holds,
    reports: unverifiedClosed(context),
    deliveries: deliverySummaries(context),
  };
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
    heads.set(record.pullRequest, known === undefined || known === record.trustedHeadSha ? record.trustedHeadSha : null);
  }
  for (const pull of copy.pullRequests ?? []) {
    if (!heads.has(numberOf(pull))) continue;
    const head = heads.get(numberOf(pull));
    if (head) pull.trustedHeadSha = head;
    else delete pull.trustedHeadSha;
  }
  return copy;
}

export { annotateSnapshot, planClosures };
