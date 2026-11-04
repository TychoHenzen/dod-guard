import assert from "node:assert/strict";
import test from "node:test";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import { ENDPOINT, fakeRest } from "./closure-snapshot.test-support.mjs";
import { fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { FOREIGN, issueContent, ok, REPO, REPO_URL } from "./fixtures/rest-shapes.mjs";

const NOT_ITEM = 99;
const GRANDCHILD = 98;
const FOREIGN_URL = `https://api.github.com/repos/${FOREIGN}`;
const issueEndpoint = (number) => `repos/${REPO}/issues/${number}`;

function routesWithStrangers() {
  const routes = fixtureRoutes();
  routes[ENDPOINT.subIssues(10)] = ok([
    [
      { number: 11, repository_url: REPO_URL },
      { number: 12, repository_url: REPO_URL },
      { number: NOT_ITEM, repository_url: REPO_URL },
      { number: 7, repository_url: FOREIGN_URL },
    ],
  ]);
  const closed = { state: "closed", stateReason: "completed" };
  routes[issueEndpoint(NOT_ITEM)] = ok(issueContent(NOT_ITEM, { ...closed, parent: 10, subIssues: 1 }));
  routes[ENDPOINT.subIssues(NOT_ITEM)] = ok([[{ number: GRANDCHILD, repository_url: REPO_URL }]]);
  routes[issueEndpoint(GRANDCHILD)] = ok(issueContent(GRANDCHILD, { ...closed, parent: NOT_ITEM }));
  return routes;
}

test("the snapshot follows sub-issues that are not Project items, and their sub-issues in turn", () => {
  const { runner, calls } = fakeRest(routesWithStrangers());
  const snapshot = buildClosureSnapshot({ repository: REPO, runner });
  const followed = snapshot.issues.filter(({ number }) => [NOT_ITEM, GRANDCHILD].includes(number));
  assert.deepEqual(
    followed.map(({ number, state, state_reason: reason }) => [number, state, reason]),
    [
      [NOT_ITEM, "closed", "completed"],
      [GRANDCHILD, "closed", "completed"],
    ],
  );
  assert.ok(!snapshot.items.some(({ content }) => content.number === NOT_ITEM));
  const reads = calls.map((args) => args.at(-1));
  assert.ok(!reads.some((read) => read.includes("/issues/7")), "a sub-issue of another repository was read");
});
