// Plans which issues to close from a queue snapshot the caller already read.
// Pure: it reads no provider and writes nothing. The close rules (originals, parents,
// hierarchy records, walk, reports, repairs) apply the verdicts from closure-delivery.mjs.
import { isOpen, judgeDelivery } from "./closure-delivery.mjs";
import {
  childNumbers,
  indexSnapshot,
  issueFor,
  itemFor,
  itemPullNumbers,
  itemStatus,
  parentNumberOf,
  preflightHolds,
  pullFor,
  statusUnreadable,
} from "../../../../lib/closure-index.mjs";
import {
  markdownSection,
  parseCompletionRecord,
  parseSupersedes,
  recordComments,
  renderClosureEvidence,
} from "./closure-records.mjs";

// One hold per issue, so the reasons found for an issue read as one entry. A hold that names no
// issue stays on its own, because it names no target issue to merge into.
function mergeHolds(holds) {
  const merged = [];
  const byIssue = new Map();
  for (const hold of holds) {
    if (hold.issue === null) {
      merged.push(hold);
      continue;
    }
    if (!byIssue.has(hold.issue)) {
      const entry = { issue: hold.issue, reasons: [] };
      byIssue.set(hold.issue, entry);
      merged.push(entry);
    }
    const entry = byIssue.get(hold.issue);
    for (const reason of hold.reasons) {
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    }
  }
  return merged;
}

// Records reasons against an issue's hold in place, so the reasons for an issue stay in one entry
// with no reason repeated. A hold that names no issue is always its own entry: it has no issue to
// merge into.
function addHold(context, issue, reasons) {
  const entry = context.holds.find((hold) => hold.issue !== null && hold.issue === issue);
  if (entry === undefined) {
    context.holds.push({ issue, reasons: [...new Set(reasons)] });
    return;
  }
  for (const reason of reasons) {
    if (!entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
    }
  }
}

// The one place that decides whether an issue is held for a write. Every close and every Project
// Done repair passes through it. A held issue is refused, and the refusal joins that issue's hold.
function admitWrite(context, issue, refusal) {
  if (context.holds.some((hold) => hold.issue === issue)) {
    addHold(context, issue, [refusal]);
    return false;
  }
  return true;
}

// The only code that appends to context.closes.
function admitClose(context, close) {
  if (!admitWrite(context, close.issue, `${close.rule} close refused: issue is held`)) {
    return false;
  }
  context.closes.push(close);
  return true;
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
    const parsed = parseSupersedes(issueFor(index, number)?.body, index.repository);
    if (parsed.error) rootErrors.push({ issue: number, reasons: [parsed.error] });
    else if (parsed.numbers.length > 0) roots.set(number, parsed.numbers);
  }
  const rootsOf = (original) => [...roots].filter(([, numbers]) => numbers.includes(original)).map(([root]) => root);
  // Indexing problems and unsafe relations are holds before any rule runs. A held issue is never
  // closed or set Done because admitClose and admitWrite refuse it, so no rule checks holds itself.
  const holds = mergeHolds([...index.problems, ...rootErrors, ...preflightHolds(index)]);
  return { index, delivery, roots, rootsOf, closes: [], holds };
}

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
  const parent = parentNumberOf(context.index, number);
  const parentRecord =
    parent === null ? null : parseCompletionRecord(issueFor(context.index, parent)?.comments).record;
  return parentRecord?.pullRequest === record.pullRequest ? parent : number;
}

function hasClosureEvidence(issue) {
  return recordComments(issue?.comments, "closure").length > 0;
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
    return {
      verified: false,
      missing: judged.flatMap(([root, value]) => prefixed(value).map((reason) => `root #${root} ${reason}`)),
    };
  }
  const issue = issueFor(context.index, number);
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
    ...pulls
      .filter((pull) => isOpen(pullFor(context.index, pull)))
      .map((pull) => `open linked pull request #${pull}`),
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

function parentClose(context, parent) {
  const children = childNumbers(context.index, parent);
  const evidence = [
    "Every sub-issue is closed with verified evidence or superseded by a verified root: " +
      `${children.map((child) => `#${child}`).join(", ")}.`,
    "No open linked pull request and no unchecked acceptance criterion outside a sub-issue remain.",
  ];
  return {
    issue: parent,
    itemId: itemFor(context.index, parent).id,
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
    ...context.index.order.filter((number) => !isOpen(issueFor(context.index, number))),
  ];
  let holds = [];
  let added = true;
  while (added) {
    const before = context.closes.length;
    holds = walkPass(context, seeds);
    added = context.closes.length > before;
  }
  for (const hold of holds) {
    addHold(context, hold.issue, hold.reasons);
  }
}

// One walk from each seed. Holds are returned, not recorded, because a later pass may
// close the parent a hold names, so only the last pass's holds survive. A planned parent
// is stepped through while the walk is within the level limit. Past the limit it ends the
// walk with no hold, since the parent is closing anyway, and the limit still bounds a
// parent cycle. Only a reason hold or a refused close stops later seeds: a walk that runs out of levels says
// nothing about whether a shallower walk can settle the parent. A level-limit hold is
// returned only when the parent is neither closed nor reason-held by the end of the pass.
function walkPass(context, seeds) {
  const holds = [];
  const reasonHeld = new Set();
  const limitHolds = new Map();
  const hold = (parent, reasons) => {
    reasonHeld.add(parent);
    holds.push({ issue: parent, reasons });
  };
  for (const seed of seeds) {
    let current = seed;
    for (let level = 1; ; level += 1) {
      const parent = parentNumberOf(context.index, current);
      if (parent === null) break;
      const issue = issueFor(context.index, parent);
      if (issue && !isOpen(issue)) break;
      if (planned(context, parent)) {
        if (level > PARENT_WALK_LIMIT) break;
        current = parent;
        continue;
      }
      if (reasonHeld.has(parent)) {
        break;
      }
      if (level > PARENT_WALK_LIMIT) {
        if (!limitHolds.has(parent)) {
          limitHolds.set(parent, [`parent walk stopped after ${PARENT_WALK_LIMIT} levels`]);
        }
        break;
      }
      const reasons = parentReasons(context, parent);
      if (issue && !itemFor(context.index, parent)?.id) reasons.push(`Project item #${parent} missing`);
      if (reasons.length > 0) {
        hold(parent, reasons);
        break;
      }
      if (!admitClose(context, parentClose(context, parent))) {
        reasonHeld.add(parent);
        break;
      }
      current = parent;
    }
  }
  const limitOnly = [...limitHolds].filter(([parent]) => !planned(context, parent) && !reasonHeld.has(parent));
  return [...holds, ...limitOnly.map(([issue, reasons]) => ({ issue, reasons }))];
}

// Closed or Done records whose close has no verified evidence are reported
// only: reopening or editing them would override an owner's decision.
function unverifiedClosed(context) {
  const reports = [];
  for (const number of context.index.order) {
    if (planned(context, number)) continue;
    const done = itemStatus(itemFor(context.index, number)) === "Done";
    if (isOpen(issueFor(context.index, number)) && !done) continue;
    const evidence = closureEvidence(context, number);
    if (!evidence.verified) reports.push({ issue: number, kind: "unverified-closed", missing: evidence.missing });
  }
  return reports;
}

// A close posts its evidence comment, closes the issue, and then sets Project Done. A run
// that stops after the close but before Done leaves a closed issue that no plan closes again,
// so a fresh snapshot must surface it here for apply to finish the Done write. The evidence
// comment is the proof that this helper made the close; without it the close came from a
// completion record or by hand, and complete-pr finalization owns it.
function statusRepairs(context) {
  const repairs = [];
  for (const number of context.index.order) {
    const issue = issueFor(context.index, number);
    const item = itemFor(context.index, number);
    if (!issue || isOpen(issue) || planned(context, number) || !item?.id) continue;
    if (statusUnreadable(item)) continue;
    const status = itemStatus(item);
    if (status === "Done") continue;
    if (recordComments(issue.comments, "closure").length !== 1) continue;
    if (!closureEvidence(context, number).verified) continue;
    if (admitWrite(context, number, "Project Done repair refused: issue is held")) {
      repairs.push({ issue: number, itemId: item.id, status });
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
