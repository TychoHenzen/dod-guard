import assert from "node:assert/strict";
import test from "node:test";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import { renderClosureEvidence } from "./closure-records.mjs";
import {
  DELIVERIES,
  chainSnapshot,
  closedWithoutEvidence,
  completionComment,
  fakeGitHub,
  holdOf,
  issue,
  item,
  mutating,
  pull,
  recordedSnapshot,
  snapshotAfter,
  supersedesBody,
} from "./closure.test-support.mjs";

test("closes #683 once every sub-issue is superseded by a verified root", () => {
  const plan = planClosures(recordedSnapshot());
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [
    [775, "replaced-original"],
    [776, "replaced-original"],
    [777, "replaced-original"],
    [778, "replaced-original"],
    [683, "parent"],
  ]);
  const parent = plan.closes.at(-1);
  assert.equal(parent.stateReason, "completed");
  assert.deepEqual(parent.children, [775, 776, 777, 778]);
  assert.match(parent.comment, /superseded by a verified root: #775, #776, #777, #778\./);
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
});

test("keeps #683 open with the reason when a sub-issue is not settled", () => {
  const cases = [
    [{ roots: [818, 820, 840] }, "child #778 is open"],
    [{ record: { 841: { pendingRows: ["AC-11"] } } }, "child #778 held: root #841 merged-pending: acceptance rows pending: AC-11"],
    [{ uncheckedOwn: true }, "unchecked acceptance criterion not mapped to a sub-issue: Publish the migration note"],
  ];
  for (const [options, reason] of cases) {
    const plan = planClosures(recordedSnapshot(options));
    assert.ok(!plan.closes.some(({ issue }) => issue === 683), reason);
    assert.deepEqual(holdOf(plan, 683).reasons, [reason]);
  }
});

test("the parent walk stops after five levels", () => {
  const plan = planClosures(chainSnapshot(7));
  assert.deepEqual(plan.closes.map(({ issue }) => issue), [777, 2001, 2002, 2003, 2004, 2005]);
  assert.deepEqual(holdOf(plan, 2006).reasons, ["parent walk stopped after 5 levels"]);
  assert.equal(holdOf(plan, 2007), undefined);
});

// The shape: open parents 777 -> 2001 -> 2002 -> 2003 -> 2004 -> 2005 -> 2006, and 2006 also
// parents 2099. Root 840 supersedes 777 and root 841 supersedes 2099, both verified. Seed 777
// reaches 2006 at level 6, past the limit, while seed 2099 reaches it at level 1 and can settle it.
function nestedChain() {
  const snapshot = recordedSnapshot();
  snapshot.items = [];
  snapshot.issues = [];
  snapshot.pullRequests = [pull(840), pull(841)];
  const open = (number, parent, children = []) => {
    snapshot.issues.push(issue(number, { parent, children }));
    snapshot.items.push(item(number, "Backlog", { parent }));
  };
  open(777, 2001);
  open(2001, 2002, [777]);
  open(2002, 2003, [2001]);
  open(2003, 2004, [2002]);
  open(2004, 2005, [2003]);
  open(2005, 2006, [2004]);
  open(2006, null, [2005, 2099]);
  open(2099, 2006);
  for (const [root, original] of [[840, 777], [841, 2099]]) {
    const body = supersedesBody([original]);
    snapshot.issues.push(issue(root, { state: "closed", body, comments: [completionComment(root)] }));
    snapshot.items.push(item(root, "Done", { linked: [DELIVERIES[root].pull] }));
  }
  return snapshot;
}

test("a walk past the level limit does not block a shallower walk", () => {
  const built = nestedChain();
  const reversed = structuredClone(built);
  reversed.issues.reverse();
  for (const snapshot of [built, reversed]) {
    const plan = planClosures(snapshot);
    assert.equal(plan.closes.find(({ issue }) => issue === 2006)?.rule, "parent");
    assert.equal(holdOf(plan, 2006), undefined);
    const closed = new Set(plan.closes.map(({ issue }) => issue));
    assert.deepEqual(plan.holds.filter(({ issue }) => closed.has(issue)), []);
  }
});

test("reports closed and Done records without verified evidence and plans no write for them", () => {
  const plan = planClosures(closedWithoutEvidence());
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(plan.reports, [
    { issue: 831, kind: "unverified-closed", missing: ["completion evidence missing"] },
    { issue: 832, kind: "unverified-closed", missing: ["completion evidence missing"] },
    { issue: 833, kind: "unverified-closed", missing: ["completion evidence missing"] },
  ]);
  const pending = planClosures(closedWithoutEvidence({ record833: { pendingRows: ["AC-15"] } }));
  assert.deepEqual(pending.reports.find(({ issue }) => issue === 833).missing, [
    "merged-pending: acceptance rows pending: AC-15",
  ]);
  const github = fakeGitHub(closedWithoutEvidence());
  assert.deepEqual(applyClosures(closedWithoutEvidence(), { runner: github.runner }).applied, []);
  assert.deepEqual(github.calls.filter(mutating), []);
});

test("a close this helper made stays verified on the next run", () => {
  const snapshot = recordedSnapshot();
  const github = fakeGitHub(snapshot);
  applyClosures(snapshot, { runner: github.runner });
  const after = snapshotAfter(snapshot, github);
  const rerun = planClosures(after);
  assert.deepEqual(rerun.closes, []);
  assert.deepEqual(rerun.holds, []);
  assert.deepEqual(rerun.reports, []);
});

test("holds a parent whose sub-issue list was not read", () => {
  const snapshot = recordedSnapshot();
  const parent = snapshot.issues.find(({ number }) => number === 683);
  delete parent.children;
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [
    [775, "replaced-original"],
    [776, "replaced-original"],
    [777, "replaced-original"],
    [778, "replaced-original"],
  ]);
  assert.deepEqual(holdOf(plan, 683).reasons, ["sub-issue list missing"]);
});

test("a root without its sub-issue list does not verify", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const root = snapshot.issues.find(({ number }) => number === 840);
  delete root.children;
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(holdOf(plan, 777).reasons, ["root #840 unverified: sub-issue list missing"]);
});

// The shape: open parent #900 above a not_planned hierarchy record #901. The record's only
// sub-issue #775 is superseded by root #818, and #901 closed on refinement with closure
// evidence, so its own close is justified. Whether #900 may close depends on #818's delivery,
// which options.record can withhold.
function hierarchyChain(options = {}) {
  const snapshot = recordedSnapshot({ roots: [818], ...options });
  snapshot.items = snapshot.items.filter(({ content }) => [775, 818].includes(content.number));
  snapshot.issues = snapshot.issues.filter(({ number }) => [775, 818].includes(number));
  snapshot.pullRequests = snapshot.pullRequests.filter(({ number }) => number === DELIVERIES[818].pull);
  snapshot.issues.find(({ number }) => number === 775).parent = { number: 901 };
  const body = renderClosureEvidence({
    issue: 901,
    stateReason: "not_planned",
    evidence: ["Pure hierarchy record."],
  });
  const hierarchy = issue(901, { state: "closed", parent: 900, children: [775], comments: [{ id: 90101, body }] });
  hierarchy.state_reason = "not_planned";
  snapshot.issues.push(hierarchy, issue(900, { children: [901] }));
  snapshot.items.push(item(901, "Done", { parent: 900 }), item(900, "Backlog"));
  return snapshot;
}

test("an open parent above a not_planned hierarchy record waits for the moved delivery", () => {
  const waiting = planClosures(hierarchyChain({ record: { 818: null } }));
  assert.ok(!waiting.closes.some(({ issue }) => issue === 900), "#900 closed before #818 delivered");
  assert.deepEqual(holdOf(waiting, 900).reasons, [
    "child #901 closed without verified evidence: child #775 held: root #818 unverified: completion evidence missing",
  ]);
  assert.ok(!waiting.reports.some(({ issue }) => issue === 901), "#901 refinement close was reported");

  const delivered = planClosures(hierarchyChain());
  assert.deepEqual(delivered.closes.map(({ issue, rule, stateReason }) => [issue, rule, stateReason]), [
    [775, "replaced-original", "completed"],
    [900, "parent", "completed"],
  ]);
  assert.equal(holdOf(delivered, 900), undefined);
});

// The shape: grandparent #700 with sub-issues #701 and #702. #701 is the parent of #775 and
// #702 the parent of #776, and roots #818 and #820 verify both replacements.
function grandparentChain() {
  const snapshot = recordedSnapshot({ roots: [818, 820] });
  snapshot.issues.find(({ number }) => number === 775).parent = { number: 701 };
  snapshot.issues.find(({ number }) => number === 776).parent = { number: 702 };
  const kept = [775, 776, 818, 820];
  const pulls = [DELIVERIES[818].pull, DELIVERIES[820].pull];
  snapshot.items = snapshot.items.filter(({ content }) => kept.includes(content.number));
  snapshot.issues = snapshot.issues.filter(({ number }) => kept.includes(number));
  snapshot.pullRequests = snapshot.pullRequests.filter(({ number }) => pulls.includes(number));
  snapshot.issues.push(
    issue(700, { children: [701, 702] }),
    issue(701, { parent: 700, children: [775] }),
    issue(702, { parent: 700, children: [776] }),
  );
  snapshot.items.push(
    item(700, "Backlog"),
    item(701, "Backlog", { parent: 700 }),
    item(702, "Backlog", { parent: 700 }),
  );
  return snapshot;
}

test("the parent walk settles a grandparent whatever the root order", () => {
  const built = grandparentChain();
  const reversed = structuredClone(built);
  reversed.issues.reverse();
  for (const snapshot of [built, reversed]) {
    const plan = planClosures(snapshot);
    const closed = plan.closes.map(({ issue }) => issue).sort((a, b) => a - b);
    assert.deepEqual(closed, [700, 701, 702, 775, 776]);
    assert.deepEqual(plan.holds, []);
    assert.equal(plan.closes.find(({ issue }) => issue === 700).rule, "parent");
  }
});
