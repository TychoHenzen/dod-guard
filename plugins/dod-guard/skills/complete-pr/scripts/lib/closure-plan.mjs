// Plans which issues to close from a queue snapshot the caller already read.
// Pure: it reads no provider and writes nothing. The close rules (originals, parents,
// hierarchy records, walk, reports, repairs) apply the verdicts from closure-delivery.mjs.

import { childNumbers, issueFor, itemFor, itemStatus, statusUnreadable } from "../../../../lib/closure-index.mjs";
import { createContext } from "./closure-context.mjs";
import { isOpen } from "./closure-delivery.mjs";
import { closureEvidence, hierarchyReasons } from "./closure-evidence.mjs";
import { addHold, admitClose, admitWrite, planned } from "./closure-holds.mjs";
import { recordComments, renderClosureEvidence } from "./closure-records.mjs";
import { walkParents } from "./closure-walk.mjs";

function originalHold(context, original) {
  const issue = issueFor(context.index, original);
  if (!issue) return [`issue #${original} readback missing`];
  if (!isOpen(issue)) return null;
  const roots = context.rootsOf(original);
  if (roots.length > 1) return [`superseded by more than one root: ${roots.map((root) => `#${root}`).join(", ")}`];
  const judged = context.delivery(roots[0]);
  if (judged.status !== "verified") {
    return judged.reasons.map((reason) => `root #${roots[0]} ${judged.status}: ${reason}`);
  }
  if (!itemFor(context.index, original)?.id) return [`Project item #${original} missing`];
  return [];
}

function planReplacedOriginal(context, root, original) {
  if (context.closes.some((close) => close.issue === original)) return;
  const reasons = originalHold(context, original);
  if (reasons === null) return;
  if (reasons.length > 0) {
    addHold(context, original, reasons);
    return;
  }
  const { record } = context.delivery(root);
  const evidence = [
    `Superseded by #${root}, delivered by pull request #${record.pullRequest} at merge commit ${record.mergeCommit}.`,
    `The completion evidence on #${root} matches the live pull request readback, and the queue ` +
      `decision for #${root} is complete.`,
  ];
  admitClose(context, {
    issue: original,
    itemId: itemFor(context.index, original).id,
    stateReason: "completed",
    rule: "replaced-original",
    root,
    pullRequest: record.pullRequest,
    mergeCommit: record.mergeCommit,
    trustedHeadSha: record.trustedHeadSha,
    comment: renderClosureEvidence({ issue: original, stateReason: "completed", evidence }),
  });
}

function planHierarchy(context, number) {
  const issue = issueFor(context.index, number);
  const reasons = issue && !isOpen(issue) ? ["issue is already closed"] : hierarchyReasons(context, number);
  if (issue && !itemFor(context.index, number)?.id) reasons.push(`Project item #${number} missing`);
  if (reasons.length > 0) {
    addHold(context, number, reasons);
    return;
  }
  const children = childNumbers(context.index, number);
  const moved = children.flatMap((child) => context.rootsOf(child).map((root) => `#${root} (for #${child})`));
  const evidence = [
    "Pure hierarchy record: no linked pull request and no unchecked acceptance criterion outside a sub-issue.",
    moved.length > 0
      ? `Delivery moved to replacement roots: ${moved.join(", ")}.`
      : "Every sub-issue is closed with verified evidence.",
  ];
  admitClose(context, {
    issue: number,
    itemId: itemFor(context.index, number).id,
    stateReason: "not_planned",
    rule: "hierarchy",
    children,
    comment: renderClosureEvidence({ issue: number, stateReason: "not_planned", evidence }),
  });
}

// Closed or Done records whose close has no verified evidence are reported
// only: reopening or editing them would override an owner's decision. An
// owner's not_planned hand close (an abandon or a fold) claims no delivery, so
// when it carries no evidence at all there is nothing to verify. A helper-made
// not_planned close, a malformed completion record, or a supersedes root still
// claims something, so those are judged as before.
function unverifiedClosed(context) {
  const reports = [];
  for (const number of context.index.order) {
    if (planned(context, number)) continue;
    const issue = issueFor(context.index, number);
    const done = itemStatus(itemFor(context.index, number)) === "Done";
    if (isOpen(issue) && !done) continue;
    const evidence = closureEvidence(context, number);
    if (evidence.verified) continue;
    const abandoned = evidence.unclaimed && issue?.state === "closed" && issue.state_reason === "not_planned";
    if (!abandoned) reports.push({ issue: number, kind: "unverified-closed", missing: evidence.missing });
  }
  return reports;
}

// A repair needs a closed, unplanned issue whose Project item is readable and not Done.
function repairTarget(context, number) {
  const issue = issueFor(context.index, number);
  const item = itemFor(context.index, number);
  if (!issue || isOpen(issue) || planned(context, number)) return null;
  if (!item?.id || statusUnreadable(item)) return null;
  const status = itemStatus(item);
  if (status === "Done") return null;
  return { issue, item, status };
}

function helperMadeVerifiedClose(context, number, issue) {
  if (recordComments(issue.comments, "closure").length !== 1) return false;
  return closureEvidence(context, number).verified;
}

// A close posts its evidence comment, closes the issue, and then sets Project Done. A run
// that stops after the close but before Done leaves a closed issue that no plan closes again,
// so a fresh snapshot must surface it here for apply to finish the Done write. The evidence
// comment is the proof that this helper made the close; without it the close came from a
// completion record or by hand, and complete-pr finalization owns it.
function statusRepairs(context) {
  const repairs = [];
  for (const number of context.index.order) {
    const target = repairTarget(context, number);
    if (!target || !helperMadeVerifiedClose(context, number, target.issue)) continue;
    if (admitWrite(context, number, "Project Done repair refused: issue is held")) {
      repairs.push({ issue: number, itemId: target.item.id, status: target.status });
    }
  }
  return repairs;
}

function deliverySummaries(context) {
  return [...context.roots.keys()].map((root) => {
    const { status, record, reasons } = context.delivery(root);
    return {
      root,
      status,
      pullRequest: record?.pullRequest ?? null,
      mergeCommit: record?.mergeCommit ?? null,
      reasons,
    };
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
    statusRepairs: statusRepairs(context),
    holds: context.holds,
    reports: unverifiedClosed(context),
    deliveries: deliverySummaries(context),
  };
}

export { planClosures };
