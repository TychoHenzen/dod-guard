import assert from "node:assert/strict";
import test from "node:test";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import { renderClosureEvidence } from "./closure-records.mjs";
import {
  DELIVERIES,
  FOREIGN_REPOSITORY,
  REPOSITORY,
  fakeGitHub,
  foreignItem,
  holdOf,
  mutating,
  recordedSnapshot,
  setField,
} from "./closure.test-support.mjs";

function closeOf(plan, number) {
  return plan.closes.find((close) => close.issue === number);
}

function issueOf(snapshot, number) {
  return snapshot.issues.find((entry) => entry.number === number);
}

function pullOf(snapshot, number) {
  return snapshot.pullRequests.find((entry) => entry.number === number);
}

function itemOf(snapshot, number) {
  return snapshot.items.find(({ content }) => content.number === number && content.repository === REPOSITORY);
}

// AC-01: a record whose repository cannot be determined is held with no issue, and it never
// supplies an item id, a Status, or a pull request to any decision.
test("AC-01: records without repository identity are held and never used by a decision", () => {
  const snapshot = recordedSnapshot();
  setField(snapshot, 777, "Repository", null);
  delete itemOf(snapshot, 777).content.repository;
  delete issueOf(snapshot, 775).repository;
  delete pullOf(snapshot, DELIVERIES[820].pull).repository;
  const plan = planClosures(snapshot);

  const unattributed = plan.holds.filter(({ issue }) => issue === null);
  assert.deepEqual(
    unattributed.map(({ reasons }) => reasons),
    [["repository identity missing"], ["repository identity missing"], ["repository identity missing"]],
  );
  assert.deepEqual(unattributed.map(({ record }) => record), [
    { kind: "item", number: 777, itemId: "PVTI_777" },
    { kind: "issue", number: 775, itemId: null },
    { kind: "pullRequest", number: DELIVERIES[820].pull, itemId: null },
  ]);
  assert.deepEqual(holdOf(plan, 777).reasons, ["Project item #777 missing"]);
  assert.equal(closeOf(plan, 777), undefined);
  assert.deepEqual(holdOf(plan, 775).reasons, ["issue #775 readback missing"]);
  assert.equal(closeOf(plan, 775), undefined);
  assert.deepEqual(holdOf(plan, 776).reasons, ["root #820 unverified: pull request #835 readback missing"]);
  assert.equal(closeOf(plan, 776), undefined);
  assert.equal(JSON.stringify(plan.closes).includes("PVTI_777"), false);
});

// AC-02: a foreign Project item that shares a target number changes no decision, and the plan is
// the same whichever order the items are listed in.
test("AC-02: a foreign Project item sharing a target number takes part in no decision", () => {
  const built = (foreignFirst) => {
    const snapshot = recordedSnapshot({ roots: [840] });
    const foreign = foreignItem(777, "Done", FOREIGN_REPOSITORY, { parent: 683, linked: [DELIVERIES[840].pull] });
    snapshot.items = foreignFirst ? [foreign, ...snapshot.items] : [...snapshot.items, foreign];
    return snapshot;
  };
  const first = planClosures(built(true));
  const last = planClosures(built(false));
  assert.deepEqual(first, last);
  assert.equal(JSON.stringify(first).includes("PVTI_foreign_777"), false);
  assert.equal(closeOf(first, 777).itemId, "PVTI_777");

  for (const foreignFirst of [true, false]) {
    const snapshot = built(foreignFirst);
    const github = fakeGitHub(snapshot);
    const foreignStatus = github.state.statuses.get("PVTI_foreign_777");
    const result = applyClosures(snapshot, { runner: github.runner });
    assert.deepEqual(result.applied, [777]);
    const endpoints = github.calls
      .filter(mutating)
      .map((args) => args.find((value) => String(value).startsWith("users/")))
      .filter(Boolean);
    const targetId = github.state.items.get("PVTI_777").numericId;
    assert.deepEqual(endpoints.map((endpoint) => endpoint.split("/").pop()), [String(targetId)]);
    assert.equal(github.state.statuses.get("PVTI_foreign_777"), foreignStatus);
    assert.equal(github.state.statuses.get("PVTI_777"), "Done");
  }
});

// AC-03: a relation that leaves the target repository holds its issue with a reason that names the
// foreign record, and a delivery that carries such a relation is unverified.
test("AC-03: cross-repository relations hold their issue and leave a delivery unverified", () => {
  const snapshot = recordedSnapshot();
  issueOf(snapshot, 683).children.push({ repository: FOREIGN_REPOSITORY, number: 12 });
  issueOf(snapshot, 777).parent = { repository: "TychoHenzen/BeeHAIve", number: 5 };
  itemOf(snapshot, 841).fields
    .find(({ name }) => name === "Linked pull requests")
    .value.push({ number: 77, repository: FOREIGN_REPOSITORY });
  const plan = planClosures(snapshot);

  assert.deepEqual(plan.closes.map(({ issue }) => issue), [775, 776]);
  assert.deepEqual(holdOf(plan, 683).reasons, ["cross-repository sub-issue TychoHenzen/DeepSeekCustom#12"]);
  assert.deepEqual(holdOf(plan, 777).reasons, ["cross-repository parent TychoHenzen/BeeHAIve#5"]);
  assert.deepEqual(holdOf(plan, 778).reasons, [
    "root #841 unverified: cross-repository linked pull request TychoHenzen/DeepSeekCustom#77",
  ]);
  const root = plan.deliveries.find(({ root: number }) => number === 841);
  assert.equal(root.status, "unverified");
  assert.deepEqual(root.reasons, ["cross-repository linked pull request TychoHenzen/DeepSeekCustom#77"]);
});

// AC-04: the records that already exist still close the same originals with the same evidence.
test("AC-04: the recorded snapshot still closes 775 and 776 with the same delivery evidence", () => {
  const plan = planClosures(recordedSnapshot({ record: { 840: null, 841: null } }));
  const summary = plan.closes.map(
    ({ issue, rule, stateReason, itemId, root, pullRequest, mergeCommit, trustedHeadSha }) => ({
      issue,
      rule,
      stateReason,
      itemId,
      root,
      pullRequest,
      mergeCommit,
      trustedHeadSha,
    }),
  );
  assert.deepEqual(summary, [
    {
      issue: 775,
      rule: "replaced-original",
      stateReason: "completed",
      itemId: "PVTI_775",
      root: 818,
      pullRequest: DELIVERIES[818].pull,
      mergeCommit: DELIVERIES[818].merge,
      trustedHeadSha: DELIVERIES[818].head,
    },
    {
      issue: 776,
      rule: "replaced-original",
      stateReason: "completed",
      itemId: "PVTI_776",
      root: 820,
      pullRequest: DELIVERIES[820].pull,
      mergeCommit: DELIVERIES[820].merge,
      trustedHeadSha: DELIVERIES[820].head,
    },
  ]);
});

// AC-06: a Status that is present but is not a string is held, and is never read as Done or repaired.
test("AC-06: an object Status is held as unreadable, not read as Done or repaired", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  setField(snapshot, 777, "Status", { name: { raw: "Done", html: "Done" } });
  Object.assign(issueOf(snapshot, 777), {
    state: "closed",
    state_reason: "completed",
    comments: [
      {
        id: 7002,
        body: renderClosureEvidence({ issue: 777, stateReason: "completed", evidence: ["Superseded by #840."] }),
      },
    ],
  });
  const plan = planClosures(snapshot);
  assert.deepEqual(holdOf(plan, 777).reasons, ["Project item Status is not a string"]);
  assert.equal(closeOf(plan, 777), undefined);
  assert.deepEqual(plan.statusRepairs, []);
});
