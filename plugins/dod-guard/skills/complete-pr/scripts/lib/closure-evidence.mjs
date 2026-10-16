// Judges whether a close is backed by evidence the helper can verify now.

import { acceptanceCriteria } from "../../../../lib/acceptance-criteria.mjs";
import {
  childNumbers,
  issueFor,
  itemFor,
  itemPullNumbers,
  parentNumberOf,
  pullFor,
} from "../../../../lib/closure-index.mjs";
import { isOpen } from "./closure-delivery.mjs";
import { planned } from "./closure-holds.mjs";
import { parseCompletionRecord, recordComments } from "./closure-records.mjs";

// ASSUMPTION: an unchecked criterion that names one of the issue's own
// sub-issues as #N belongs to that sub-issue's delivery, so it does not hold
// the parent; any other unchecked criterion is the parent's own scope.
function unmappedCriteria(issue, children) {
  return acceptanceCriteria(issue?.body)
    .filter((item) => !item.checked)
    .map((item) => item.text)
    .filter((text) => !children.some((child) => new RegExp(`#${child}\\b`).test(text)));
}

function prefixed(judged) {
  return judged.reasons.map((reason) => `${judged.status}: ${reason}`);
}

// The delivery group an issue's own completion record belongs to: its parent's
// when the parent recorded the same pull request, otherwise its own.
function recordGroup(context, number, record) {
  const parent = parentNumberOf(context.index, number);
  const parentRecord = parent === null ? null : parseCompletionRecord(issueFor(context.index, parent)?.comments).record;
  return parentRecord?.pullRequest === record.pullRequest ? parent : number;
}

function hasClosureEvidence(issue) {
  return recordComments(issue?.comments, "closure").length > 0;
}

function childReason(context, child, seen) {
  if (planned(context, child)) return null;
  const hold = context.holds.find((entry) => entry.issue === child);
  if (hold) return `child #${child} held: ${hold.reasons.join("; ")}`;
  const issue = issueFor(context.index, child);
  if (!issue) return `child #${child} readback missing`;
  if (isOpen(issue)) return `child #${child} is open`;
  const evidence = closureEvidence(context, child, { seen, purpose: "delivered" });
  return evidence.verified ? null : `child #${child} closed without verified evidence: ${evidence.missing.join("; ")}`;
}

// The preconditions both kinds of parent close share, kept in one place so a rule
// added for one kind cannot silently miss the other. A result without `children`
// carries only the reasons the parent cannot be judged.
function recordBase(context, number) {
  const issue = issueFor(context.index, number);
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
  const pulls = itemPullNumbers(context.index, itemFor(context.index, number));
  reasons.push(
    ...pulls.filter((pull) => isOpen(pullFor(context.index, pull))).map((pull) => `open linked pull request #${pull}`),
  );
  reasons.push(...base.reasons);
  return reasons;
}

// A pure hierarchy record owns no delivery of its own: no linked pull request,
// no unchecked criterion outside its sub-issues, and every sub-issue either
// settled or named by an existing replacement root's supersedes record.
function hierarchyReasons(context, number, seen = new Set([number])) {
  const base = recordBase(context, number);
  if (!base.children) return base.reasons;
  const pulls = itemPullNumbers(context.index, itemFor(context.index, number));
  const reasons = pulls.map((pull) => `linked pull request #${pull}`);
  reasons.push(...base.reasons);
  for (const child of base.children) {
    if (context.rootsOf(child).length > 0) continue;
    const reason = childReason(context, child, new Set(seen));
    if (reason) reasons.push(`${reason}, and no replacement root supersedes it`);
  }
  return reasons;
}

function rootEvidence(context, roots) {
  const judged = roots.map((root) => [root, context.delivery(root)]);
  if (roots.length === 1 && judged[0][1].status === "verified") return { verified: true };
  return {
    verified: false,
    missing: judged.flatMap(([root, value]) => prefixed(value).map((reason) => `root #${root} ${reason}`)),
  };
}

function recordEvidence(context, number, record) {
  const judged = context.delivery(recordGroup(context, number, record));
  return judged.status === "verified" ? { verified: true } : { verified: false, missing: prefixed(judged) };
}

function claimedEvidence(context, number, issue, seen, purpose) {
  const hierarchy = issue.state_reason === "not_planned" && purpose === "justified";
  const rule = hierarchy ? hierarchyReasons : parentReasons;
  const missing = rule(context, number, seen);
  return { verified: missing.length === 0, missing };
}

function issueEvidence(context, number, seen, purpose) {
  const issue = issueFor(context.index, number);
  const own = parseCompletionRecord(issue?.comments);
  if (own.error) return { verified: false, missing: [own.error] };
  if (own.record) return recordEvidence(context, number, own.record);
  if (hasClosureEvidence(issue)) return claimedEvidence(context, number, issue, seen, purpose);
  return { verified: false, missing: ["completion evidence missing"], unclaimed: true };
}

// Whether an issue's close is backed by evidence the helper can verify now: a
// verified root that supersedes it, its own verified delivery, or a closure
// evidence comment whose rule still holds. Purpose "justified" asks whether the
// close itself stands: a refinement may close a not_planned hierarchy record
// before its moved delivery lands. Purpose "delivered" asks whether a parent may
// count the issue as settled for its own completed close, which must wait for
// that delivery. `unclaimed` marks an issue that carries no evidence of any kind.
function closureEvidence(context, number, { seen = new Set(), purpose = "justified" } = {}) {
  if (seen.has(number)) return { verified: false, missing: ["sub-issue relationship cycle"] };
  seen.add(number);
  const roots = context.rootsOf(number);
  if (roots.length > 0) return rootEvidence(context, roots);
  return issueEvidence(context, number, seen, purpose);
}

export { closureEvidence, hierarchyReasons, parentReasons };
