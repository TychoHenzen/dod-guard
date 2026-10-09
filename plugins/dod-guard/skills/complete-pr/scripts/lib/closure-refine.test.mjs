import assert from "node:assert/strict";
import test from "node:test";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import { fakeGitHub, recordedSnapshot } from "./closure.test-support.mjs";

// At refinement time #840 and #841 had not merged, so they carry no
// completion record yet.
function atRefinement(options = {}) {
  return recordedSnapshot({ record: { 840: null, 841: null }, ...options });
}

function holdOf(plan, issue) {
  return plan.holds.find((hold) => hold.issue === issue);
}

test("refinement closes #683 as a pure hierarchy record while undelivered originals stay open", () => {
  const plan = planClosures(atRefinement(), { hierarchy: 683 });
  assert.deepEqual(plan.closes.map(({ issue, rule, stateReason }) => [issue, rule, stateReason]), [
    [775, "replaced-original", "completed"],
    [776, "replaced-original", "completed"],
    [683, "hierarchy", "not_planned"],
  ]);
  assert.match(plan.closes.at(-1).comment, /Delivery moved to replacement roots: #818 \(for #775\), #820 \(for #776\), #840 \(for #777\), #841 \(for #778\)\./);
  assert.deepEqual(holdOf(plan, 777).reasons, ["root #840 unverified: completion evidence missing"]);
  assert.deepEqual(holdOf(plan, 778).reasons, ["root #841 unverified: completion evidence missing"]);
});

test("refinement keeps an issue that still owns delivery scope open", () => {
  const unsuperseded = planClosures(atRefinement({ roots: [818, 820, 840] }), { hierarchy: 683 });
  assert.deepEqual(holdOf(unsuperseded, 683).reasons, [
    "child #778 is open, and no replacement root supersedes it",
  ]);
  const ownScope = planClosures(atRefinement({ uncheckedOwn: true }), { hierarchy: 683 });
  assert.deepEqual(holdOf(ownScope, 683).reasons, [
    "unchecked acceptance criterion not mapped to a sub-issue: Publish the migration note",
  ]);
  const linked = atRefinement();
  linked.items[0].fields[3].value = [{ number: 999, repository: linked.repository }];
  assert.deepEqual(holdOf(planClosures(linked, { hierarchy: 683 }), 683).reasons, ["linked pull request #999"]);
});

test("without the refinement request the plan never closes #683 as not_planned", () => {
  const plan = planClosures(atRefinement());
  assert.ok(!plan.closes.some(({ issue }) => issue === 683));
  assert.match(holdOf(plan, 683).reasons.join("; "), /child #777 held: root #840 unverified/);
});

test("a hierarchy close stays verified on the next run", () => {
  const snapshot = atRefinement();
  const github = fakeGitHub(snapshot);
  assert.deepEqual(applyClosures(snapshot, { runner: github.runner, hierarchy: 683 }).applied, [775, 776, 683]);
  assert.equal(github.state.issues.get(683).state_reason, "not_planned");
  const after = structuredClone(snapshot);
  for (const issue of after.issues) {
    const live = github.state.issues.get(issue.number);
    Object.assign(issue, { state: live.state, state_reason: live.state_reason, comments: live.comments });
  }
  for (const item of after.items) item.fields[0].value = { name: github.state.statuses.get(item.content.number) };
  const rerun = planClosures(after);
  assert.deepEqual(rerun.closes, []);
  assert.equal(rerun.reports.find(({ issue }) => issue === 683), undefined);
});
