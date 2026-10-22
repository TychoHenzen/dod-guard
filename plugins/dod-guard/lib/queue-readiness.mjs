// What a queue group needs before select-next may pick it: the owner's parked record, an unfinished
// delivery branch, open blockers, and a readable refinement. queue-classifier.mjs judges completion
// evidence and calls this module for the holds that only apply to work that has not started. Every
// function is pure and reads only the records it is handed.

import { parseIssueBodyRecords } from "./issue-body-records.mjs";
import { parkedRecords } from "./parked-record.mjs";
import { branchReasons } from "./queue-branches.mjs";
import { sameRepository } from "./repository-identity.mjs";

function hold(reasons) {
  return { kind: "hold", eligible: false, reasons: [...new Set(reasons)] };
}

function heldBy(reasons, extra = {}) {
  return reasons.length > 0 ? { ...hold(reasons), ...extra } : null;
}

function rootOf(records) {
  return records.find((record) => record.parentIssueNumber === null);
}

// A blocker holds the group unless it is closed or is the group's own work. A blocker whose state is not
// "closed" counts as open, so an unreadable state never passes as unblocked. A queue candidate whose
// blocker list was never read is held the way a missing sub-issue list is.
function blockerReasons(records, context) {
  const members = new Set(records.map(({ issueNumber }) => issueNumber));
  const insideGroup = (blocker) =>
    sameRepository(blocker?.repository, context.repository) && members.has(blocker?.number);
  const closed = (blocker) => String(blocker?.state).toLowerCase() === "closed";
  return records.flatMap(({ issueNumber, issue }) => {
    if (!Array.isArray(issue.blockedBy)) return [`issue #${issueNumber} blocked_by relationship missing`];
    return issue.blockedBy
      .filter((blocker) => !(closed(blocker) || insideGroup(blocker)))
      .map((blocker) => `issue #${issueNumber} is blocked by ${blocker?.repository}#${blocker?.number}`);
  });
}

// A Todo root is picked up by /next-ticket, which stops on a body whose refinement records cannot be read.
// The parser's errors and remainder are the reasons, so the selector never holds a second copy of the
// refinement rules.
function refinementReasons({ issueNumber, issue }) {
  if (typeof issue.body !== "string" || issue.body.trim() === "") return [`issue #${issueNumber} has no refined body`];
  const { errors, remainder } = parseIssueBodyRecords(issue.body);
  return [...errors, ...remainder].map((reason) => `issue #${issueNumber} ${reason}`);
}

// A parked root is held by the owner's decision, so the reason carries the record's own words. Only the
// root is read: a parked sub-issue never parks the delivery it belongs to.
function parkedReasons(root) {
  if (!root) return [];
  return parkedRecords(root.issue?.comments).map(
    ({ blocked, unblocksWhen }) => `issue #${root.issueNumber} is parked: ${blocked}; unblocks when: ${unblocksWhen}`,
  );
}

function refinementDecision(root, status) {
  if (status !== "Todo" || !root) return null;
  const reasons = refinementReasons(root);
  return reasons.length > 0 ? { kind: "needs-refinement", eligible: false, reasons } : null;
}

// The first decision a step returns. A step that has nothing to say returns null.
function firstDecision(steps) {
  return steps.reduce((found, step) => found ?? step(), null);
}

// The owner's parked record outranks every other state of an unmerged group, even an In Progress one.
function parkedDecision(records) {
  return heldBy(parkedReasons(rootOf(records)));
}

// The decision for a Todo or Backlog group that carries no completion evidence. The unfinished-branch
// marker lets selectGroup withhold new work for as long as any root has an unfinished branch.
function readyDecision(records, context, status) {
  const root = rootOf(records);
  return (
    firstDecision([
      () => heldBy(branchReasons(root, context), { unfinishedBranch: true }),
      () => heldBy(blockerReasons(records, context)),
      () => refinementDecision(root, status),
    ]) ?? { kind: "eligible", eligible: true, status, reasons: [] }
  );
}

export { firstDecision, hold, parkedDecision, readyDecision };
