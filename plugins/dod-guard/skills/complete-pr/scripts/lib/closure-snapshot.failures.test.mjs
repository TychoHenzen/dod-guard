// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import {
  ENDPOINT,
  fakeRest,
  fieldPages,
  issueContent,
  linkedProjectNode,
  linkedProjectsReply,
  ok,
  projectItem,
  pull,
  REPO,
} from "./closure-snapshot.test-support.mjs";

const HEAD_SHA = "a1".repeat(20);
const DEEP_SEEK = "TychoHenzen/Deep+Seek";
const VALUES = ENDPOINT.values(2);
const PREFIX = "closure snapshot read failed: ";

// Issue 10 is a plain target issue. Issue 11 has parent 10 and links one open pull request, so a
// healthy build lists two issues and one pull request and reads no check runs.
function basePages() {
  return [
    [
      projectItem("PVTI_t10", 1010, issueContent(10)),
      projectItem("PVTI_t11", 1111, issueContent(11, { parent: 10 }), {
        parent: 10,
        linked: [pull(21, { sha: HEAD_SHA, state: "open", merged: false })],
      }),
    ],
  ];
}

const issueTen = (pages) => pages[0][0];
const issueEleven = (pages) => pages[0][1];
const linkedValue = (pages) => issueEleven(pages).fields.find((field) => field.name === "Linked pull requests");

// Routes are built after the mutation because ok() serializes its value when it is called.
function routesAfter(change) {
  const pages = basePages();
  const extra = change?.(pages) ?? {};
  return {
    [ENDPOINT.repository]: ok({ full_name: REPO, default_branch: "master" }),
    [ENDPOINT.linkedProjects]: linkedProjectsReply([linkedProjectNode(2)]),
    [ENDPOINT.fields(2)]: ok(fieldPages()),
    [VALUES]: ok(pages),
    ...extra,
  };
}

function failureOf(routes) {
  try {
    buildClosureSnapshot({ repository: REPO, runner: fakeRest(routes).runner });
  } catch (error) {
    return error;
  }
  return assert.fail("the build was expected to fail");
}

const CASES = [
  {
    name: "issue body that is not a string or null (476)",
    change: (pages) => {
      issueTen(pages).content.body = 5;
    },
    endpoint: `repos/${REPO}/issues/10`,
    detail: "issue #10 body and state_reason must be strings or null",
  },
  {
    name: "parent_issue_url that names no issue (486)",
    change: (pages) => {
      issueEleven(pages).content.parent_issue_url = "https://example.test/x";
    },
    endpoint: `repos/${REPO}/issues/11`,
    detail: "issue #11 parent_issue_url must name an issue",
  },
  {
    name: "issue item with no state (513)",
    change: (pages) => {
      delete issueTen(pages).content.state;
    },
    endpoint: `repos/${REPO}/issues`,
    detail: "an issue item must carry a number and a state",
  },
  {
    name: "Linked pull requests value that is not a list (344)",
    change: (pages) => {
      linkedValue(pages).value = {};
    },
    endpoint: VALUES,
    detail: "item PVTI_t11 has a Linked pull requests value that is not a list",
  },
  {
    name: "linked pull request URL that names no pull request (357)",
    change: (pages) => {
      linkedValue(pages).value = [{ ...linkedValue(pages).value[0], url: "https://example.test/pulls/21" }];
    },
    endpoint: VALUES,
    detail: "item PVTI_t11 has a linked pull request URL that names no pull request",
  },
  {
    name: "linked pull request base repository that names no repository (361)",
    change: (pages) => {
      const linked = { ...linkedValue(pages).value[0], url: undefined };
      linked.base = { ...linked.base, repo: { full_name: DEEP_SEEK } };
      linkedValue(pages).value = [linked];
    },
    endpoint: VALUES,
    detail: "item PVTI_t11 has a linked pull request base repository that names no repository",
  },
  {
    name: "linked pull request with no repository or number (382)",
    change: (pages) => {
      const linked = { ...linkedValue(pages).value[0], url: undefined, number: undefined };
      linked.base = { ref: "master", sha: linked.base.sha };
      linkedValue(pages).value = [linked];
    },
    endpoint: VALUES,
    detail: "item PVTI_t11 has a linked pull request with no repository or number",
  },
  {
    name: "item content that is not an object (413)",
    change: (pages) => {
      issueTen(pages).content = "text";
    },
    endpoint: VALUES,
    detail: "item PVTI_t10 has content that is not an object",
  },
  {
    name: "sub-issue entry without repository_url (447)",
    change: (pages) => {
      issueTen(pages).content.sub_issues_summary.total = 1;
      return { [ENDPOINT.subIssues(10)]: ok([[{ number: 11 }]]) };
    },
    endpoint: ENDPOINT.subIssues(10),
    detail: "every sub-issue must name its repository_url and number",
  },
  {
    name: "comment entry without a body (461)",
    change: (pages) => {
      issueTen(pages).content.comments = 1;
      return { [ENDPOINT.comments(10)]: ok([[{ id: 9001 }]]) };
    },
    endpoint: ENDPOINT.comments(10),
    detail: "every comment must carry an id and a string body",
  },
  {
    name: "pull request head repository that names no repository (567)",
    change: (pages) => {
      linkedValue(pages).value[0].head.repo.full_name = DEEP_SEEK;
    },
    endpoint: VALUES,
    detail: "pull request #21 head repository names no repository",
  },
  {
    name: "pull request with no head sha (572)",
    change: (pages) => {
      linkedValue(pages).value[0].head.sha = undefined;
    },
    endpoint: VALUES,
    detail: "pull request #21 must carry a state, head and base refs, and SHAs",
  },
];

test("the base fixture builds, so every case below fails for its own planted departure", () => {
  const snapshot = buildClosureSnapshot({ repository: REPO, runner: fakeRest(routesAfter()).runner });
  assert.deepEqual(
    snapshot.issues.map((issue) => issue.number),
    [10, 11],
  );
  assert.deepEqual(
    snapshot.pullRequests.map((request) => request.number),
    [21],
  );
});

for (const { name, change, endpoint, detail } of CASES) {
  test(`closure snapshot names the exact failure for ${name}`, () => {
    const error = failureOf(routesAfter(change));
    assert.equal(error.name, "SnapshotReadError");
    assert.equal(error.message, `${PREFIX}${endpoint}: ${detail}`);
  });
}
