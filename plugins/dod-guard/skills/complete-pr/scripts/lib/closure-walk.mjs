// Walks upward from planned and closed issues, closing each open parent whose sub-issues are all settled.
import { childNumbers, issueFor, itemFor, parentNumberOf } from "../../../../lib/closure-index.mjs";
import { isOpen } from "./closure-delivery.mjs";
import { parentReasons } from "./closure-evidence.mjs";
import { addHold, admitClose, planned } from "./closure-holds.mjs";
import { renderClosureEvidence } from "./closure-records.mjs";

const PARENT_WALK_LIMIT = 5;

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

function holdParent(state, parent, reasons) {
  state.reasonHeld.add(parent);
  state.holds.push({ issue: parent, reasons });
}

// Judges one open, unplanned parent. Returns the parent to continue from when this walk closed it,
// or null when the walk stops here.
function settleParent(context, state, parent, issue) {
  const reasons = parentReasons(context, parent);
  if (issue && !itemFor(context.index, parent)?.id) reasons.push(`Project item #${parent} missing`);
  if (reasons.length > 0) {
    holdParent(state, parent, reasons);
    return null;
  }
  if (!admitClose(context, parentClose(context, parent))) {
    state.reasonHeld.add(parent);
    return null;
  }
  return parent;
}

// One level of a walk from `current`. Returns the next issue to climb from, or null to end the walk.
function walkStep(context, state, current, level) {
  const parent = parentNumberOf(context.index, current);
  if (parent === null) return null;
  const issue = issueFor(context.index, parent);
  if (issue && !isOpen(issue)) return null;
  if (planned(context, parent)) return level > PARENT_WALK_LIMIT ? null : parent;
  if (state.reasonHeld.has(parent)) return null;
  if (level > PARENT_WALK_LIMIT) {
    if (!state.limitHolds.has(parent)) {
      state.limitHolds.set(parent, [`parent walk stopped after ${PARENT_WALK_LIMIT} levels`]);
    }
    return null;
  }
  return settleParent(context, state, parent, issue);
}

// One walk from each seed. Holds are returned, not recorded, because a later pass may
// close the parent a hold names, so only the last pass's holds survive. A planned parent
// is stepped through while the walk is within the level limit. Past the limit it ends the
// walk with no hold, since the parent is closing anyway, and the limit still bounds a
// parent cycle. Only a reason hold or a refused close stops later seeds: a walk that runs out of levels says
// nothing about whether a shallower walk can settle the parent. A level-limit hold is
// returned only when the parent is neither closed nor reason-held by the end of the pass.
function walkPass(context, seeds) {
  const state = { holds: [], reasonHeld: new Set(), limitHolds: new Map() };
  for (const seed of seeds) {
    let current = seed;
    for (let level = 1; current !== null; level += 1) {
      current = walkStep(context, state, current, level);
    }
  }
  const limitOnly = [...state.limitHolds].filter(
    ([parent]) => !planned(context, parent) && !state.reasonHeld.has(parent),
  );
  return [...state.holds, ...limitOnly.map(([issue, reasons]) => ({ issue, reasons }))];
}

export { walkParents };
