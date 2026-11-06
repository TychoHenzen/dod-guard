import assert from "node:assert/strict";
import test from "node:test";
import { planClosures } from "./closure-plan.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { OWNER, REPO } from "./fixtures/rest-shapes.mjs";

test("AC-05: the snapshot has the documented top-level keys and the project object", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot), [
    "repository",
    "defaultBranch",
    "project",
    "items",
    "issues",
    "pullRequests",
    "branches",
    "unlinkedPullRequests",
  ]);
  assert.equal(snapshot.repository, REPO);
  assert.equal(snapshot.defaultBranch, "master");
  assert.deepEqual(Object.keys(snapshot.project), ["owner", "number", "statusFieldId", "doneOptionId"]);
  assert.deepEqual(snapshot.project, {
    owner: OWNER,
    number: 2,
    statusFieldId: "PVTSSF_status",
    doneOptionId: "opt-done",
  });
});

test("AC-06: a Status spelled as {raw, html} becomes its name in the snapshot", () => {
  const snapshot = build(fixtureRoutes());
  assert.equal(snapshot.items.find((entry) => entry.id === "PVTI_t11").fields[0].value, "Done");
});

test("AC-07: the built snapshot plans with no repository identity hold", () => {
  const plan = planClosures(build(fixtureRoutes()));
  const identityHolds = plan.holds.filter((hold) => hold.reasons.includes("repository identity missing"));
  assert.deepEqual(identityHolds, []);
});
