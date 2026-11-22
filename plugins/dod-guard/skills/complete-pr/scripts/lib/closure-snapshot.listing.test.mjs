import assert from "node:assert/strict";
import test from "node:test";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { FOREIGN, REPO } from "./fixtures/rest-shapes.mjs";

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
