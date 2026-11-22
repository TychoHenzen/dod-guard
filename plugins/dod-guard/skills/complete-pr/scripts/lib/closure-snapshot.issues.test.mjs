import assert from "node:assert/strict";
import test from "node:test";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import { ENDPOINT, fakeRest } from "./closure-snapshot.test-support.mjs";
import { COMMENT_BODY, EPIC_BODY } from "./fixtures/closure-snapshot-pages.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { REPO } from "./fixtures/rest-shapes.mjs";

test("AC-05: issues list only target records, with children and parent as repository and number", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.issues[0]), [
    "number",
    "repository",
    "state",
    "state_reason",
    "title",
    "body",
    "parent",
    "children",
    "blockedBy",
    "comments",
  ]);
  assert.deepEqual(snapshot.issues, [
    {
      number: 10,
      repository: REPO,
      state: "open",
      state_reason: null,
      title: "Issue 10",
      body: EPIC_BODY,
      parent: null,
      children: [
        { repository: REPO, number: 11 },
        { repository: REPO, number: 12 },
      ],
      blockedBy: [],
      comments: [{ id: 9001, body: COMMENT_BODY, author_association: "OWNER" }],
    },
    {
      number: 11,
      repository: REPO,
      state: "closed",
      state_reason: "completed",
      title: "Issue 11",
      body: "",
      parent: { repository: REPO, number: 10 },
      children: [],
      blockedBy: [],
      comments: [],
    },
    {
      number: 12,
      repository: REPO,
      state: "open",
      state_reason: null,
      title: "Issue 12",
      body: "",
      parent: { repository: REPO, number: 10 },
      children: [],
      blockedBy: [],
      comments: [],
    },
  ]);
});

test("AC-05: an issue whose content omits parent_issue_url has no parent", () => {
  const snapshot = build(fixtureRoutes("absent-parent-url"));
  assert.equal(snapshot.issues.find((issue) => issue.number === 10).parent, null);
  assert.deepEqual(snapshot, build(fixtureRoutes()));
});

test("blocked_by: an open issue with blockers reads its list, a zero count or a closed issue reads none", () => {
  const { runner, calls } = fakeRest(fixtureRoutes("blocked"));
  const snapshot = buildClosureSnapshot({ repository: REPO, runner });
  const blockedBy = (number) => snapshot.issues.find((issue) => issue.number === number).blockedBy;
  assert.deepEqual(blockedBy(12), [{ repository: REPO, number: 250, state: "open" }]);
  assert.deepEqual(blockedBy(10), []);
  assert.deepEqual(blockedBy(11), []);
  const endpoints = calls.map((args) => args.at(-1));
  assert.ok(endpoints.includes(ENDPOINT.blockedBy(12)));
  assert.ok(!endpoints.includes(ENDPOINT.blockedBy(10)));
  assert.ok(!endpoints.includes(ENDPOINT.blockedBy(11)));
});
