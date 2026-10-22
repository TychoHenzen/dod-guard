import assert from "node:assert/strict";
import test from "node:test";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import { ENDPOINT, fakeRest } from "./closure-snapshot.test-support.mjs";
import { build, buildFailure, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { REPO } from "./fixtures/rest-shapes.mjs";

test("the snapshot lists every pushed codex branch and marks the one an open pull request heads", () => {
  assert.deepEqual(build(fixtureRoutes()).branches, [
    { name: "codex/10-example", openPullRequest: true },
    { name: "codex/11-stalled", openPullRequest: false },
  ]);
});

test("a repository with no codex branch has an empty branch list", () => {
  assert.deepEqual(build(fixtureRoutes("no-branches")).branches, []);
});

test("an open pull request from a fork that reuses the branch name does not mark the branch", () => {
  assert.deepEqual(build(fixtureRoutes("fork-pull")).branches, [
    { name: "codex/10-example", openPullRequest: false },
    { name: "codex/11-stalled", openPullRequest: false },
  ]);
});

test("the branch and open pull request lists are each read once, as GET requests", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  const endpoints = calls.map((args) => args.at(-1));
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.branches).length, 1);
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.openPulls).length, 1);
});

test("a failed branch read names the branch endpoint once", () => {
  const error = buildFailure(fixtureRoutes("branches-failure"));
  assert.ok(error?.message.startsWith(`closure snapshot read failed: ${ENDPOINT.branches}:`), error?.message);
  assert.equal(error.message.split("closure snapshot read failed:").length - 1, 1, error.message);
});
