import assert from "node:assert/strict";
import test from "node:test";
import { PROJECT_FIELDS, readQueueSnapshot, selectQueueItem } from "./queue-readback.mjs";

function projectItem({ id, repository, number, status, parentIssue, linkedPullRequests = [] }) {
  return {
    id,
    content: { number, repository },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: repository },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: linkedPullRequests },
    ],
  };
}

test("reads every Project page, filters the repository, and preserves PR head evidence", async () => {
  const calls = [];
  const mutations = [];
  const pages = [
    {
      items: [
        projectItem({
          id: "444",
          repository: "TychoHenzen/dod-guard",
          number: 444,
          status: "Done",
          linkedPullRequests: [{ number: 700 }],
        }),
        projectItem({
          id: "foreign",
          repository: "other/repository",
          number: 1,
          status: "Todo",
        }),
        projectItem({
          id: "536",
          repository: "TychoHenzen/dod-guard",
          number: 536,
          status: "Done",
          parentIssue: { number: 444 },
          linkedPullRequests: [{ number: 700 }],
        }),
      ],
      pageInfo: { hasNextPage: true, nextCursor: "page-2" },
    },
    {
      items: [
        projectItem({
          id: "517",
          repository: "TychoHenzen/dod-guard",
          number: 517,
          status: "Todo",
        }),
        projectItem({
          id: "31",
          repository: "TychoHenzen/dod-guard",
          number: 31,
          status: "Backlog",
        }),
      ],
      pageInfo: { hasNextPage: false },
    },
  ];
  const issues = new Map([
    [444, { number: 444, state: "closed", children: [{ number: 536, state: "closed" }] }],
    [536, { number: 536, state: "closed", parent: { number: 444 } }],
    [517, { number: 517, state: "open", children: [] }],
    [31, { number: 31, state: "open", children: [] }],
  ]);
  const provider = {
    async listProjectItems(request) {
      calls.push(request);
      return pages[calls.length - 1];
    },
    async readIssue({ issueNumber }) {
      return issues.get(issueNumber);
    },
    async readPullRequest({ pullNumber }) {
      assert.equal(pullNumber, 700);
      return {
        number: 700,
        repository: "TychoHenzen/dod-guard",
        state: "closed",
        mergedAt: "2026-09-20T00:00:00Z",
        head: {
          repository: "TychoHenzen/dod-guard",
          ref: "codex/444",
          sha: "head-444",
        },
        base: { ref: "master", sha: "base-444" },
        mergeCommit: { oid: "merge-444" },
      };
    },
    mutate(...args) {
      mutations.push(args);
    },
  };

  const snapshot = await readQueueSnapshot({
    provider,
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.deepEqual(calls.map(({ after }) => after), [undefined, "page-2"]);
  assert.deepEqual(calls.map(({ fields, query, perPage }) => ({ fields, query, perPage })), [
    { fields: PROJECT_FIELDS, query: "is:issue", perPage: 100 },
    { fields: PROJECT_FIELDS, query: "is:issue", perPage: 100 },
  ]);
  assert.deepEqual(snapshot.items.map(({ content }) => content.number), [444, 536, 517, 31]);
  assert.equal(snapshot.records.find(({ issueNumber }) => issueNumber === 536).parentIssueNumber, 444);
  assert.deepEqual(snapshot.records.find(({ issueNumber }) => issueNumber === 444).childIssues, [
    { number: 536, state: "closed" },
  ]);
  assert.deepEqual(snapshot.pullRequests[0], {
    number: 700,
    repository: "TychoHenzen/dod-guard",
    state: "closed",
    mergedAt: "2026-09-20T00:00:00Z",
    head: {
      repository: "TychoHenzen/dod-guard",
      ref: "codex/444",
      sha: "head-444",
    },
    base: { ref: "master", sha: "base-444" },
    mergeCommit: { oid: "merge-444" },
    headRepository: "TychoHenzen/dod-guard",
    headRef: "codex/444",
    headSha: "head-444",
    baseRef: "master",
    baseSha: "base-444",
    mergeCommitSha: "merge-444",
    requiredChecks: null,
  });
  assert.deepEqual(mutations, []);
});

test("selects the normal Todo parent after excluding merged delivery groups", async () => {
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [
            projectItem({
              id: "444",
              repository: "TychoHenzen/dod-guard",
              number: 444,
              status: "Done",
              linkedPullRequests: [{ number: 700 }],
            }),
            projectItem({
              id: "536",
              repository: "TychoHenzen/dod-guard",
              number: 536,
              status: "Done",
              parentIssue: { number: 444 },
              linkedPullRequests: [{ number: 700 }],
            }),
            projectItem({
              id: "517",
              repository: "TychoHenzen/dod-guard",
              number: 517,
              status: "Todo",
            }),
            projectItem({
              id: "31",
              repository: "TychoHenzen/dod-guard",
              number: 31,
              status: "Backlog",
            }),
          ],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue({ issueNumber }) {
        return {
          number: issueNumber,
          state: issueNumber === 444 || issueNumber === 536 ? "closed" : "open",
          parent: issueNumber === 536 ? { number: 444 } : null,
          children: issueNumber === 444 ? [{ number: 536, state: "closed" }] : [],
        };
      },
      async readPullRequest() {
        return { state: "closed", mergedAt: "2026-09-20T00:00:00Z" };
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  const selected = selectQueueItem(snapshot);
  assert.equal(selected.rootIssueNumber, 517);
  assert.deepEqual(selected.records.map(({ issueNumber }) => issueNumber), [517]);
  assert.equal(selectQueueItem({ ...snapshot, records: snapshot.records.filter(({ issueNumber }) => issueNumber !== 517) }).rootIssueNumber, 31);
});
