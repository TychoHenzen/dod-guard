import assert from "node:assert/strict";
import test from "node:test";
import { planClosures } from "./closure-plan.mjs";
import { ARCHIVED_ISSUE_NUMBER, ARCHIVED_PULL_NUMBER, valuePages } from "./fixtures/closure-snapshot-pages.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { statusValueName } from "./project-reads.mjs";

const DISAGREE = /disagree/u;
const BLANK = /blank/u;
const NOT_A_NAME = /not a name/u;
const ARCHIVED_ISSUE = /#13\b/u;

test("AC-06: statusValueName reads one name from each REST spelling and rejects the rest", () => {
  assert.equal(statusValueName("Done"), "Done");
  assert.equal(statusValueName({ name: "Done" }), "Done");
  assert.equal(statusValueName({ id: "opt-done", name: { raw: "Done", html: "Done" } }), "Done");
  assert.equal(statusValueName(null), null);
  assert.equal(statusValueName(undefined), null);
  assert.throws(() => statusValueName({ name: { raw: "Done", html: "Todo" } }), DISAGREE);
  assert.throws(() => statusValueName({ name: { raw: " ", html: " " } }), BLANK);
  assert.throws(() => statusValueName({ id: "opt-done" }), NOT_A_NAME);
});

test("an archived item is left out of items and issues, and an item with archived_at null is kept", () => {
  const snapshot = build(fixtureRoutes("archived"));
  const ids = snapshot.items.map((entry) => entry.id);
  assert.ok(!ids.includes("PVTI_t13"), ids.join(", "));
  assert.ok(ids.includes("PVTI_t11"), ids.join(", "));
  const numbers = snapshot.issues.map((issue) => issue.number);
  assert.ok(!numbers.includes(ARCHIVED_ISSUE_NUMBER), numbers.join(", "));
  const kept = snapshot.items.find((entry) => entry.id === "PVTI_t11");
  assert.ok(numbers.includes(kept.content.number), numbers.join(", "));
});

test("an item with no archived_at key is kept", () => {
  const [[raw]] = valuePages();
  assert.equal(Object.hasOwn(raw, "archived_at"), false);
  const snapshot = build(fixtureRoutes("archived"));
  assert.ok(snapshot.items.some((entry) => entry.id === raw.node_id));
  assert.ok(snapshot.issues.some((issue) => issue.number === raw.content.number));
});

test("a PullRequest Project item with no repository key is left out of items and changes nothing else", () => {
  const snapshot = build(fixtureRoutes("pull-request-item"));
  assert.ok(!snapshot.items.some((entry) => entry.id === "PVTI_pr"));
  assert.deepEqual(snapshot, build(fixtureRoutes()));
});

test("an issue and pull request reached only through an archived item leave no record and no failure", () => {
  const snapshot = build(fixtureRoutes("archived"));
  assert.deepEqual(snapshot, build(fixtureRoutes()));
  assert.ok(!snapshot.pullRequests.some((record) => record.number === ARCHIVED_PULL_NUMBER));
  const plan = planClosures(snapshot);
  assert.doesNotMatch(JSON.stringify(plan), ARCHIVED_ISSUE);
});
