import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECT_FIELDS,
  defaultQueueDecision,
  reconcileProjectCounts,
  readQueueSnapshot,
  selectQueueItem,
} from "./queue-readback.mjs";
import { localDate } from "./friction-log.mjs";

function projectItem({ id, repository, number, status, parentIssue, linkedPullRequests = [], state }) {
  return {
    id,
    node_id: `PVTI_${id}`,
    content: { number, repository, ...(state ? { state } : {}) },
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
    project: { owner: "TychoHenzen", number: 2, id: "PVT_live-project" },
    repository: "TychoHenzen/dod-guard",
  });

  assert.deepEqual(calls.map(({ after }) => after), [undefined, "page-2"]);
  assert.deepEqual(calls.map(({ project }) => project), [
    { owner: "TychoHenzen", number: 2, id: "PVT_live-project" },
    { owner: "TychoHenzen", number: 2, id: "PVT_live-project" },
  ]);
  assert.deepEqual(calls.map(({ fields, query, perPage }) => ({ fields, query, perPage })), [
    { fields: PROJECT_FIELDS, query: "is:issue", perPage: 100 },
    { fields: PROJECT_FIELDS, query: "is:issue", perPage: 100 },
  ]);
  assert.deepEqual(snapshot.items.map(({ content }) => content.number), [444, 536, 517, 31]);
  assert.deepEqual(snapshot.items.map(({ id, node_id }) => ({ id, node_id })), [
    { id: "444", node_id: "PVTI_444" },
    { id: "536", node_id: "PVTI_536" },
    { id: "517", node_id: "PVTI_517" },
    { id: "31", node_id: "PVTI_31" },
  ]);
  assert.deepEqual(snapshot.counts, {
    rawItems: 4,
    parentItems: 3,
    childItems: 1,
    parentDoneItems: 1,
    childDoneItems: 1,
    balanced: true,
    missingEvidence: [],
  });
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

test("reports missing Parent issue evidence instead of inferring a balanced count", () => {
  const counts = reconcileProjectCounts(
    [{ id: "99" }],
    [{
      issueNumber: 99,
      parentIssueNumber: null,
      parentIssueFieldObserved: false,
      projectStatus: "Done",
    }],
  );

  assert.equal(counts.rawItems, 1);
  assert.equal(counts.parentItems, 1);
  assert.equal(counts.parentDoneItems, 1);
  assert.equal(counts.balanced, false);
  assert.deepEqual(counts.missingEvidence, ["Project item #99 Parent issue"]);
});

test("reports contradictory Project and issue parent relationships", async () => {
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({
            id: "child",
            repository: "TychoHenzen/dod-guard",
            number: 536,
            status: "Todo",
            parentIssue: null,
          })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 536, state: "open", parent: { number: 444 }, children: [] };
      },
      async readPullRequest() {
        return null;
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.ok(snapshot.evidence.staleRelationships.some(({ mismatches }) =>
    mismatches.includes("Project Parent issue is missing the observed issue parent")));
  assert.ok(snapshot.missingEvidence.includes("relationship/head evidence changed during read"));
});

test("reports a missing issue parent when the Project records a child relationship", async () => {
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({
            id: "child",
            repository: "TychoHenzen/dod-guard",
            number: 536,
            status: "Todo",
            parentIssue: 444,
          })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 536, state: "open", children: [] };
      },
      async readPullRequest() {
        return null;
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.ok(snapshot.evidence.staleRelationships.some(({ mismatches }) =>
    mismatches.includes("issue parent is missing the observed Project Parent issue")));
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

test("deduplicates identical pages but holds conflicting duplicate and status-drift records", async () => {
  const parent = projectItem({
    id: "parent",
    repository: "TychoHenzen/dod-guard",
    number: 100,
    status: "Todo",
  });
  const child = projectItem({
    id: "child",
    repository: "TychoHenzen/dod-guard",
    number: 101,
    status: "Backlog",
    parentIssue: { number: 100 },
  });
  const snapshot = await readQueueSnapshot({
    provider: {
      calls: 0,
      async listProjectItems() {
        this.calls += 1;
        return this.calls === 1
          ? { items: [parent, child], pageInfo: { hasNextPage: true, nextCursor: "next" } }
          : { items: [parent, child], pageInfo: { hasNextPage: false } };
      },
      async readIssue({ issueNumber }) {
        return {
          number: issueNumber,
          state: "open",
          parent: issueNumber === 101 ? { number: 100 } : null,
          children: issueNumber === 100 ? [{ number: 101 }] : [],
        };
      },
      async readPullRequest() {
        throw new Error("unexpected PR read");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.deepEqual(snapshot.items.map((item) => item.content.number), [100, 101]);
  assert.equal(snapshot.evidence.duplicates.length, 2);
  assert.deepEqual(snapshot.evidence.duplicateConflicts, []);
  assert.equal(snapshot.records[0].projectStatus, "Todo");
  assert.equal(snapshot.records[1].projectStatus, "Backlog");
  assert.equal(selectQueueItem(snapshot), null);

  const conflicting = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [parent, { ...parent, fields: parent.fields.map((field) => field.name === "Status" ? { ...field, value: { name: "Backlog" } } : field) }],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { state: "open", children: [] };
      },
      async readPullRequest() {
        throw new Error("unexpected PR read");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });
  assert.equal(conflicting.evidence.duplicateConflicts.length, 1);
  assert.equal(selectQueueItem(conflicting), null);
});

test("records missing Project fields and orphan relationships as holds", async () => {
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [
            {
              id: "missing-status",
              content: { number: 200, repository: "TychoHenzen/dod-guard" },
              fields: [{ name: "Repository", value: "TychoHenzen/dod-guard" }],
            },
            projectItem({
              id: "orphan",
              repository: "TychoHenzen/dod-guard",
              number: 201,
              status: "Todo",
              parentIssue: { number: 999 },
            }),
          ],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue({ issueNumber }) {
        return {
          number: issueNumber,
          state: "open",
          parent: issueNumber === 201 ? { number: 999 } : null,
          children: [],
        };
      },
      async readPullRequest() {
        throw new Error("unexpected PR read");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.ok(snapshot.records[0].missingEvidence.includes("Status"));
  assert.ok(snapshot.records[1].missingEvidence.includes("parent issue #999 Project item"));
  assert.ok(snapshot.missingEvidence.includes("parent issue #999 Project item"));
  assert.equal(selectQueueItem(snapshot), null);
});

test("holds an incomplete or looping Project page with exact pagination evidence", async () => {
  let calls = 0;
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        calls += 1;
        return {
          items: calls === 1
            ? [projectItem({ id: "page", repository: "TychoHenzen/dod-guard", number: 250, status: "Todo" })]
            : [],
          pageInfo: { hasNextPage: true, nextCursor: "same-cursor" },
        };
      },
      async readIssue() {
        return { number: 250, state: "open", children: [] };
      },
      async readPullRequest() {
        throw new Error("must not read PR");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.equal(calls, 2);
  assert.equal(snapshot.readFailures[0].operation, "listProjectItems");
  assert.match(snapshot.readFailures[0].message, /stable cursor/);
  assert.deepEqual(snapshot.readFailures[0].missingEvidence, [
    "complete Project item pagination",
    "stable Project page cursor",
  ]);
  assert.equal(selectQueueItem(snapshot), null);
});

test("holds stale issue and pull-request relationships instead of selecting them", async () => {
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({
            id: "stale",
            repository: "TychoHenzen/dod-guard",
            number: 300,
            status: "Todo",
            state: "open",
            linkedPullRequests: [{
              number: 30,
              repository: "TychoHenzen/dod-guard",
              state: "closed",
              mergedAt: "2026-09-27T00:00:00Z",
              headSha: "old-head",
              baseRef: "master",
            }],
          })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 300, state: "closed", children: [] };
      },
      async readPullRequest() {
        return {
          number: 30,
          repository: "TychoHenzen/dod-guard",
          state: "open",
          head: { repository: "TychoHenzen/dod-guard", ref: "codex/300", sha: "new-head" },
          base: { ref: "master", sha: "base" },
        };
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.deepEqual(snapshot.evidence.staleRelationships, [
    { kind: "issue", issueNumber: 300, mismatches: ["issue state changed during read"] },
    {
      kind: "pull_request",
      number: 30,
      repository: "TychoHenzen/dod-guard",
      mismatches: ["state changed during read", "merge timestamp changed during read", "head SHA changed during read"],
    },
  ]);
  assert.equal(selectQueueItem(snapshot), null);
});

test("retries one transient read, never retries rate limits or entitlement failures, and records exact errors", async () => {
  let projectReads = 0;
  const transient = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        projectReads += 1;
        if (projectReads === 1) throw Object.assign(new Error("temporary upstream failure"), { status: 503 });
        return {
          items: [projectItem({ id: "transient", repository: "TychoHenzen/dod-guard", number: 400, status: "Todo" })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 400, state: "open", children: [] };
      },
      async readPullRequest() {
        throw new Error("unexpected PR read");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });
  assert.equal(projectReads, 2);
  assert.equal(transient.readFailures.length, 0);
  assert.equal(transient.evidence.retries[0].status, 503);
  assert.equal(selectQueueItem(transient).rootIssueNumber, 400);

  let rateLimitReads = 0;
  const rateLimited = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        rateLimitReads += 1;
        throw Object.assign(new Error("API rate limit exceeded"), { status: 429, retryAfterMs: 60_000 });
      },
      async readIssue() {
        throw new Error("must not read issue after page failure");
      },
      async readPullRequest() {
        throw new Error("must not read PR after page failure");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });
  assert.equal(rateLimitReads, 1);
  assert.deepEqual(rateLimited.readFailures[0], {
    operation: "listProjectItems",
    request: {
      project: { owner: "TychoHenzen", number: 2, id: null },
      query: "is:issue",
      fields: PROJECT_FIELDS,
      perPage: 100,
    },
    attempt: 1,
    attempts: 1,
    category: "rate_limit",
    code: null,
    status: 429,
    message: "API rate limit exceeded",
    retryable: false,
    retryAfterMs: 60_000,
    missingEvidence: ["complete Project item pages"],
  });
  assert.equal(selectQueueItem(rateLimited), null);

  let markedRateLimitReads = 0;
  const markedRateLimited = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        markedRateLimitReads += 1;
        throw Object.assign(new Error("forbidden token=secret"), {
          status: 403,
          headers: { "X-RateLimit-Reset": "1700000000" },
        });
      },
      async readIssue() {
        throw new Error("must not read issue after marked rate limit");
      },
      async readPullRequest() {
        throw new Error("must not read PR after marked rate limit");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });
  assert.equal(markedRateLimitReads, 1);
  assert.equal(markedRateLimited.readFailures[0].category, "rate_limit");
  assert.equal(markedRateLimited.readFailures[0].rateLimitResetAt, 1_700_000_000);
  assert.doesNotMatch(markedRateLimited.readFailures[0].message, /secret/);
  assert.equal(selectQueueItem(markedRateLimited), null);

  let entitlementReads = 0;
  const denied = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({ id: "denied", repository: "TychoHenzen/dod-guard", number: 401, status: "Todo" })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        entitlementReads += 1;
        throw Object.assign(new Error("forbidden entitlement"), { status: 403 });
      },
      async readPullRequest() {
        throw new Error("must not read PR after issue denial");
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });
  assert.equal(entitlementReads, 1);
  assert.equal(denied.readFailures[0].operation, "readIssue");
  assert.equal(denied.readFailures[0].category, "entitlement");
  assert.deepEqual(denied.records[0].missingEvidence, ["issue #401"]);
  assert.equal(selectQueueItem(denied), null);
});

test("falls back once from explicit MCP 429 and 403 exhaustion without changing the read request", async () => {
  for (const failure of [
    Object.assign(new Error("API rate limit exceeded"), { status: 429, retryAfterMs: 60_000 }),
    Object.assign(new Error("API rate limit exceeded token=secret"), {
      status: 403,
      headers: { "X-RateLimit-Reset": "1700000000" },
    }),
  ]) {
    const primaryRequests = [];
    const restRequests = [];
    const item = projectItem({ id: "fallback", repository: "TychoHenzen/dod-guard", number: 405, status: "Todo" });
    const snapshot = await readQueueSnapshot({
      provider: {
        async listProjectItems(request) {
          primaryRequests.push(request);
          throw failure;
        },
        async readIssue() {
          return { number: 405, state: "open", children: [] };
        },
        async readPullRequest() {
          throw new Error("unexpected PR read");
        },
        rest: {
          async listProjectItems(request) {
            restRequests.push(request);
            return { items: [item], pageInfo: { hasNextPage: false } };
          },
        },
      },
      project: { owner: "TychoHenzen", number: 2, id: "PVT_live" },
      repository: "TychoHenzen/dod-guard",
    });

    assert.equal(primaryRequests.length, 1);
    assert.deepEqual(restRequests, primaryRequests);
    assert.equal(selectQueueItem(snapshot).rootIssueNumber, 405);
    assert.equal(snapshot.evidence.transportFailures.length, 1);
    assert.equal(snapshot.evidence.transportFailures[0].failure.category, "mcp_rate_limit");
    assert.doesNotMatch(snapshot.evidence.transportFailures[0].failure.message, /secret/);
  }
});

test("stops after one REST failure following MCP exhaustion", async () => {
  let primaryCalls = 0;
  let restCalls = 0;
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        primaryCalls += 1;
        throw Object.assign(new Error("API rate limit exceeded"), { status: 429 });
      },
      async readIssue() {
        throw new Error("must not read issue after project failure");
      },
      async readPullRequest() {
        throw new Error("must not read PR after project failure");
      },
      rest: {
        async listProjectItems() {
          restCalls += 1;
          throw Object.assign(new Error("REST temporarily unavailable"), { status: 503 });
        },
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.equal(primaryCalls, 1);
  assert.equal(restCalls, 1);
  assert.equal(snapshot.evidence.readAttempts.length, 1);
  assert.equal(snapshot.evidence.retries.length, 0);
  assert.equal(snapshot.evidence.readFailures.length, 1);
  assert.equal(snapshot.evidence.readFailures[0].retryable, false);
  assert.deepEqual(snapshot.evidence.transportFailures.map(({ failure }) => failure.category), [
    "mcp_rate_limit",
    "transient",
  ]);
});

test("holds a timed-out pull request after the single bounded retry", async () => {
  let pullReads = 0;
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({
            id: "timeout",
            repository: "TychoHenzen/dod-guard",
            number: 402,
            status: "Todo",
            linkedPullRequests: [{ number: 4020, repository: "TychoHenzen/dod-guard" }],
          })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 402, state: "open", children: [] };
      },
      async readPullRequest() {
        pullReads += 1;
        throw Object.assign(new Error("provider timed out"), { code: "ETIMEDOUT" });
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
  });

  assert.equal(pullReads, 2);
  assert.equal(snapshot.readFailures[0].operation, "readPullRequest");
  assert.equal(snapshot.readFailures[0].category, "timeout");
  assert.equal(snapshot.readFailures[0].attempts, 2);
  assert.equal(snapshot.records[0].missingEvidence[0], "pull request TychoHenzen/dod-guard#4020");
  assert.equal(selectQueueItem(snapshot), null);
});

test("excludes a fully verified merged record without mutating it", async () => {
  const mutations = [];
  const snapshot = await readQueueSnapshot({
    provider: {
      async listProjectItems() {
        return {
          items: [projectItem({
            id: "complete",
            repository: "TychoHenzen/dod-guard",
            number: 500,
            status: "Done",
            linkedPullRequests: [{ number: 5000, repository: "TychoHenzen/dod-guard" }],
          })],
          pageInfo: { hasNextPage: false },
        };
      },
      async readIssue() {
        return { number: 500, state: "closed", children: [], activeCheckpoint: false };
      },
      async readPullRequest() {
        return {
          number: 5000,
          repository: "TychoHenzen/dod-guard",
          state: "closed",
          mergedAt: "2026-09-27T00:00:00Z",
          trustedHead: true,
          head: { repository: "TychoHenzen/dod-guard", ref: "codex/500", sha: "head-500" },
          base: { ref: "master", sha: "base-500" },
          mergeCommit: { oid: "merge-500" },
          requiredChecks: [{ name: "build-test", bucket: "pass" }],
        };
      },
      mutate(...args) {
        mutations.push(args);
      },
    },
    project: { owner: "TychoHenzen", number: 2 },
    repository: "TychoHenzen/dod-guard",
    defaultBranch: "master",
  });

  const decision = defaultQueueDecision(snapshot.records.map((record) => ({ ...record, orphan: false })), snapshot);
  assert.deepEqual(decision, { kind: "complete", eligible: false, status: "Done", reasons: [] });
  assert.equal(selectQueueItem(snapshot), null);
  assert.deepEqual(mutations, []);
});

test("holds the current day's friction log and queues earlier logs as Backlog work", () => {
  const record = (title) => [
    { issueNumber: 700, parentIssueNumber: null, projectStatus: "Backlog", issue: { number: 700, state: "open", title }, pullRequests: [] },
  ];
  const context = { today: "2026-09-28" };

  assert.deepEqual(defaultQueueDecision(record("Friction log 2026-09-28"), context), {
    kind: "hold",
    eligible: false,
    reasons: ["friction log still collecting entries"],
  });
  assert.equal(defaultQueueDecision(record("Friction log 2026-09-27"), context).eligible, true);
  assert.equal(defaultQueueDecision(record("Friction log 2026-09-28 follow-up"), context).eligible, true);
});

test("friction-log dates use the local calendar day and the queue defaults to today", () => {
  assert.equal(localDate(new Date(2026, 8, 5, 23, 59)), "2026-09-05");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 0)), "2026-01-01");

  const todayLog = {
    issueNumber: 701,
    parentIssueNumber: null,
    projectStatus: "Backlog",
    issue: { number: 701, state: "open", title: `Friction log ${localDate(new Date())}` },
    pullRequests: [],
  };
  const ordinary = { ...todayLog, issueNumber: 702, issue: { number: 702, state: "open", title: "Ordinary backlog work" } };
  assert.equal(selectQueueItem({ records: [todayLog, ordinary] }).rootIssueNumber, 702);
  assert.equal(selectQueueItem({ records: [todayLog] }), null);
});
