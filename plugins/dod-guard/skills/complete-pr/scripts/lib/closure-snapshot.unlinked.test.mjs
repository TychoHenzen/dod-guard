import assert from "node:assert/strict";
import test from "node:test";
import { ENDPOINT } from "./closure-snapshot.test-support.mjs";
import { build, buildFailure, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { FOREIGN, ok, REPO } from "./fixtures/rest-shapes.mjs";

// One open pull request with the given number and head ref, from the given head repository.
function pullFrom(number, ref, repository = REPO) {
  return { number, head: { ref, repo: { full_name: repository } } };
}

// The healthy route table with the open pull request read answering with the given pulls.
function withOpenPulls(...pulls) {
  const routes = fixtureRoutes();
  routes[ENDPOINT.openPulls] = ok([pulls]);
  return routes;
}

test("the healthy fixture lists its open pull request, which no item links", () => {
  assert.deepEqual(build(fixtureRoutes()).unlinkedPullRequests, [{ number: 31, headRef: "codex/10-example" }]);
});

test("an open pull request an item links is not listed", () => {
  // Item PVTI_t11 links REPO#21.
  const snapshot = build(withOpenPulls(pullFrom(21, "codex/11-x"), pullFrom(31, "codex/10-example")));
  assert.deepEqual(snapshot.unlinkedPullRequests, [{ number: 31, headRef: "codex/10-example" }]);
});

test("a same-numbered reference from another repository does not link", () => {
  // Item PVTI_t12 links FOREIGN#77 only.
  const snapshot = build(withOpenPulls(pullFrom(77, "feature")));
  assert.deepEqual(snapshot.unlinkedPullRequests, [{ number: 77, headRef: "feature" }]);
});

test("a fork-headed open pull request is listed", () => {
  const snapshot = build(withOpenPulls(pullFrom(31, "feature", FOREIGN)));
  assert.deepEqual(snapshot.unlinkedPullRequests, [{ number: 31, headRef: "feature" }]);
});

test("no open pull request gives an empty list", () => {
  assert.deepEqual(build(withOpenPulls()).unlinkedPullRequests, []);
});

test("an open pull request with a non-integer number fails the read and names the endpoint", () => {
  const error = buildFailure(withOpenPulls(pullFrom("x", "feature")));
  assert.ok(error?.message.startsWith(`closure snapshot read failed: ${ENDPOINT.openPulls}:`), error?.message);
  assert.ok(error.message.includes("positive integer number"), error.message);
});
