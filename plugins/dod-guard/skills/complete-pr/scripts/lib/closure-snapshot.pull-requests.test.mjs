import assert from "node:assert/strict";
import test from "node:test";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import { ENDPOINT, fakeRest } from "./closure-snapshot.test-support.mjs";
import { CHECKS, HEAD, MERGE } from "./fixtures/closure-snapshot-pages.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { BASE_SHA, MERGED_AT, ok, REPO } from "./fixtures/rest-shapes.mjs";

test("AC-05: pull requests list only target records, and a merged one carries its required checks", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.pullRequests[0]), [
    "number",
    "repository",
    "state",
    "mergedAt",
    "head",
    "base",
    "mergeCommit",
    "requiredChecks",
  ]);
  assert.deepEqual(snapshot.pullRequests, [
    {
      number: 21,
      repository: REPO,
      state: "closed",
      mergedAt: MERGED_AT,
      head: { repository: REPO, ref: "codex/21", sha: HEAD[21] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: { oid: MERGE[21] },
      requiredChecks: CHECKS,
    },
    {
      number: 23,
      repository: REPO,
      state: "closed",
      mergedAt: MERGED_AT,
      head: { repository: REPO, ref: "codex/23", sha: HEAD[23] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: { oid: MERGE[23] },
      requiredChecks: CHECKS,
    },
    {
      number: 22,
      repository: REPO,
      state: "open",
      mergedAt: null,
      head: { repository: REPO, ref: "codex/22", sha: HEAD[22] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: null,
      requiredChecks: null,
    },
  ]);
});

test("AC-05: an open pull request with a test-merge commit has no merge commit and no required checks", () => {
  const unmerged = build(fixtureRoutes()).pullRequests.find(({ number }) => number === 22);
  assert.deepEqual(
    { mergedAt: unmerged.mergedAt, mergeCommit: unmerged.mergeCommit, requiredChecks: unmerged.requiredChecks },
    { mergedAt: null, mergeCommit: null, requiredChecks: null },
  );
});

test("AC-05: branch protection is read once for two merged pull requests on one base", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  const endpoints = calls.map((args) => args.at(-1));
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.protection).length, 1);
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.checkRuns(HEAD[21])).length, 1);
});

test("AC-05: a branch with no protection reads as no required checks, not as a failure", () => {
  const snapshot = build(fixtureRoutes("no-protection"));
  const merged = snapshot.pullRequests.filter(({ mergedAt }) => mergedAt !== null);
  assert.deepEqual(
    merged.map(({ requiredChecks }) => requiredChecks),
    [[], []],
  );
});

test("AC-05: a merged pull request is not judged on a required check that never ran on its head", () => {
  const routes = fixtureRoutes();
  routes[ENDPOINT.protection] = ok({ contexts: ["build-test", "lint", "quality-guard"] });
  const snapshot = build(routes);
  const merged = snapshot.pullRequests.filter(({ mergedAt }) => mergedAt !== null);
  assert.deepEqual(
    merged.map(({ requiredChecks }) => requiredChecks),
    [CHECKS, CHECKS],
  );
});
