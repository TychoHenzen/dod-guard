import assert from "node:assert/strict";
import test from "node:test";
import { planClosures } from "./closure-plan.mjs";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import { ENDPOINT, fakeRest } from "./closure-snapshot.test-support.mjs";
import { COMMENT_BODY, EPIC_BODY } from "./fixtures/closure-snapshot-pages.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { FOREIGN, OWNER, REPO } from "./fixtures/rest-shapes.mjs";

test("AC-05: the snapshot has the documented top-level keys and the project object", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot), [
    "repository",
    "defaultBranch",
    "project",
    "items",
    "issues",
    "pullRequests",
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

test("AC-05: items hold both pages and both repositories, each with a top-level repository", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.items[0]), [
    "id",
    "databaseId",
    "contentType",
    "repository",
    "content",
    "fields",
  ]);
  assert.deepEqual(snapshot.items, [
    {
      id: "PVTI_t10",
      databaseId: 1010,
      contentType: "Issue",
      repository: REPO,
      content: { number: 10, repository: REPO },
      fields: [
        { name: "Status", value: "Backlog" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: null },
        { name: "Linked pull requests", value: [] },
      ],
    },
    {
      id: "PVTI_f11",
      databaseId: 1011,
      contentType: "Issue",
      repository: FOREIGN,
      content: { number: 11, repository: FOREIGN },
      fields: [
        { name: "Status", value: "Backlog" },
        { name: "Repository", value: FOREIGN },
        { name: "Parent issue", value: null },
        { name: "Linked pull requests", value: [] },
      ],
    },
    {
      id: "PVTI_t11",
      databaseId: 1111,
      contentType: "Issue",
      repository: REPO,
      content: { number: 11, repository: REPO },
      fields: [
        { name: "Status", value: "Done" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: { repository: REPO, number: 10 } },
        { name: "Linked pull requests", value: [{ repository: REPO, number: 21 }] },
      ],
    },
    {
      id: "PVTI_t12",
      databaseId: 1112,
      contentType: "Issue",
      repository: REPO,
      content: { number: 12, repository: REPO },
      fields: [
        { name: "Status", value: "Todo" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: { repository: REPO, number: 10 } },
        {
          name: "Linked pull requests",
          value: [
            { repository: REPO, number: 23 },
            { repository: REPO, number: 22 },
            { repository: FOREIGN, number: 77 },
          ],
        },
      ],
    },
  ]);
});

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
      comments: [{ id: 9001, body: COMMENT_BODY }],
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

test("AC-06: a Status spelled as {raw, html} becomes its name in the snapshot", () => {
  const snapshot = build(fixtureRoutes());
  assert.equal(snapshot.items.find((entry) => entry.id === "PVTI_t11").fields[0].value, "Done");
});

test("AC-07: the built snapshot plans with no repository identity hold", () => {
  const plan = planClosures(build(fixtureRoutes()));
  const identityHolds = plan.holds.filter((hold) => hold.reasons.includes("repository identity missing"));
  assert.deepEqual(identityHolds, []);
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
