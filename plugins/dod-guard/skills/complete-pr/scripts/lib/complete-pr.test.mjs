// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest, recoverMergedPullRequest, waitForHeadConvergence } from "./complete-pr.mjs";
import { CompletionError } from "./completion-error.mjs";
import { GitHubClient, normalizePullRequest } from "./github-client.mjs";

const pendingChecks = [{ bucket: "pending", name: "build-test", state: "IN_PROGRESS" }];
const passingChecks = [{ bucket: "pass", name: "build-test", state: "SUCCESS" }];
const requiredCheckNames = ["build-test", "plugin-config", "static-analysis", "package-integrity"];
const headShaField = "head_sha";
const workflowRunsField = "workflow_runs";
const workflowRunsPattern = /workflow_runs/;
const PERMISSION_ERROR = /HTTP 403: auto-merge requires administration permission/;
const PROJECT_STATUS_FIELD_ID = 407;
const codexMethodPattern = /codex/i;

function linkedProjectItem(id, number = 24, repository = "owner/repo") {
  return {
    id,
    node_id: `PVTI_item-${id}`,
    content: {
      number,
      repository: { full_name: repository },
      repository_url: `https://api.github.com/repos/${repository}`,
    },
  };
}

function projectStatusResponse(status, id = 1701, number = 24, repository = "owner/repo") {
  return {
    ...linkedProjectItem(id, number, repository),
    fields: [{
      id: PROJECT_STATUS_FIELD_ID,
      name: "Status",
      value: { name: { raw: status } },
    }],
  };
}

function projectItemIdentity(item) {
  return {
    id: item.id,
    node_id: item.node_id,
    content: {
      number: item.content?.number,
      repository: {
        full_name: item.content?.repository?.full_name,
        fullName: item.content?.repository?.fullName,
      },
      repository_url: item.content?.repository_url,
    },
  };
}

function createProjectStatusReader({
  projects = [{ number: 2, state: "open" }],
  itemsByProject = new Map([["2", [linkedProjectItem(1701)]]]),
  fieldsByProject = new Map([["2", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]]]),
  itemResponses = new Map([["2/1701", projectStatusResponse("Done")]]),
  itemPagesByProject = new Map(),
  rateLimitedProjects = new Set(),
} = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint === "users/owner/projectsV2?per_page=100") {
      return { status: 0, stderr: "", stdout: JSON.stringify([projects]) };
    }

    const fieldsMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/fields\?/);
    if (fieldsMatch) {
      return { status: 0, stderr: "", stdout: JSON.stringify([fieldsByProject.get(fieldsMatch[1]) ?? []]) };
    }

    const itemListMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/items\?/);
    if (itemListMatch) {
      if (rateLimitedProjects.has(itemListMatch[1])) {
        return { status: 1, stderr: "HTTP 403: API rate limit exceeded", stdout: "" };
      }
      const pages = itemPagesByProject.get(itemListMatch[1]);
      const items = (pages ?? [itemsByProject.get(itemListMatch[1]) ?? []]).flat().map(projectItemIdentity);
      return {
        status: 0,
        stderr: "",
        stdout: items.map((item) => JSON.stringify(item)).join("\n"),
      };
    }

    const itemMatch = endpoint?.match(/^users\/owner\/projectsV2\/(\d+)\/items\/(\d+)\?/);
    if (itemMatch) {
      const response = itemResponses.get(`${itemMatch[1]}/${itemMatch[2]}`);
      if (!response) {
        throw new Error(`Unexpected item endpoint: ${endpoint}`);
      }
      return { status: 0, stderr: "", stdout: JSON.stringify(response) };
    }

    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, reader: new GitHubClient("owner/repo", 24, runner) };
}

function pull(overrides = {}) {
  return {
    baseBranch: "master",
    baseSha: "base-1",
    headBranch: "codex/24-complete-pr",
    headRepository: "owner/repo",
    headSha: "head-1",
    isCrossRepository: false,
    isDraft: true,
    mergeCommitSha: null,
    mergeState: "BLOCKED",
    mergeable: "MERGEABLE",
    number: 24,
    state: "OPEN",
    ...overrides,
  };
}

function workflowRun(headSha, overrides = {}) {
  return {
    conclusion: "success",
    event: "push",
    [headShaField]: headSha,
    name: "CI",
    path: ".github/workflows/ci.yml@refs/heads/codex/24-complete-pr",
    status: "completed",
    ...overrides,
  };
}

function unresolvedThread(overrides = {}) {
  return {
    author: "pr-author",
    id: "thread-1",
    outdated: false,
    path: "src/a.mjs",
    url: "https://github.com/owner/repo/pull/24#discussion_r1",
    ...overrides,
  };
}

const mutationCallNames = ["markReady", "enableRepositoryAutoMerge", "dispatch", "mergePullRequest"];
const discussionUrlPattern = /https:\/\/github\.com\/owner\/repo\/pull\/24#discussion_r1/;
const sourcePathPattern = /src\/a\.mjs/;

function nextValue(values) {
  if (values.length > 1) {
    return values.shift();
  }
  return values[0];
}

class FixtureClient {
  constructor(options = {}) {
    this.repository = options.clientRepository ?? "owner/repo";
    this.repositoryDetails = {
      autoMergeAllowed: false,
      canPush: true,
      defaultBranch: "master",
      nameWithOwner: "owner/repo",
      ...options.repository,
    };
    this.pulls = [...(options.pulls ?? [])];
    this.checks = [...(options.checks ?? [passingChecks])];
    this.commits = options.commits ?? {};
    this.issues = [...(options.issues ?? [[{ number: 24, state: "CLOSED", url: "issue" }]])];
    this.projectStatuses = [...(options.projectStatuses ?? [["Done"]])];
    this.refs = [...(options.refs ?? [{ sha: "head-1" }, null])];
    this.sourceRefs = options.sourceRefs ? [...options.sourceRefs] : null;
    this.pullRefs = options.pullRefs ? [...options.pullRefs] : null;
    this.lastPullHeadSha = "head-1";
    this.workflowRuns = options.workflowRuns ?? null;
    this.workflowDispatchError = options.workflowDispatchError;
    this.enableRepositoryError = options.enableRepositoryError;
    this.deleteBranchError = options.deleteBranchError;
    this.requiredChecksError = options.requiredChecksError;
    this.projectStatusReader = options.projectStatusReader;
    this.reviewThreads = [...(options.reviewThreads ?? [[]])];
    this.calls = [];
  }

  getRepository() {
    return this.repositoryDetails;
  }

  getPullRequest() {
    const value = nextValue(this.pulls);
    this.lastPullHeadSha = value.headSha;
    this.calls.push(["getPullRequest", value.headSha, value.state]);
    return value;
  }

  markReady(number) {
    this.calls.push(["markReady", number]);
  }

  enableRepositoryAutoMerge() {
    this.calls.push(["enableRepositoryAutoMerge"]);
    if (this.enableRepositoryError) {
      throw this.enableRepositoryError;
    }
  }

  mergePullRequest(number, headSha) {
    this.calls.push(["mergePullRequest", number, headSha]);
  }

  getRequiredChecks() {
    this.calls.push(["getRequiredChecks"]);
    if (this.requiredChecksError) {
      throw this.requiredChecksError;
    }
    return nextValue(this.checks);
  }

  getCiWorkflowRuns(headSha) {
    this.calls.push(["getCiWorkflowRuns", headSha]);
    if (!this.workflowRuns) {
      return [workflowRun(headSha)];
    }
    const runs = nextValue(this.workflowRuns);
    return typeof runs === "function" ? runs(headSha) : runs;
  }

  dispatchCiWorkflow(branchName) {
    this.calls.push(["dispatch", branchName]);
    if (this.workflowDispatchError) {
      throw this.workflowDispatchError;
    }
  }

  updateBranch(number, headSha) {
    this.calls.push(["updateBranch", number, headSha]);
  }

  getCommit(sha) {
    return this.commits[sha];
  }

  getLinkedIssues() {
    return nextValue(this.issues);
  }

  getIssueProjectStatuses(issueNumber) {
    if (this.projectStatusReader) {
      return this.projectStatusReader(issueNumber);
    }
    return nextValue(this.projectStatuses);
  }

  getBranchRef(branchName) {
    this.calls.push(["getBranchRef", branchName]);
    return nextValue(this.refs);
  }

  getSourceBranchRef(branchName) {
    this.calls.push(["getSourceBranchRef", branchName]);
    return this.sourceRefs
      ? nextValue(this.sourceRefs)
      : { sha: this.lastPullHeadSha };
  }

  getPullRequestRefs(number) {
    this.calls.push(["getPullRequestRefs", number]);
    return this.pullRefs
      ? nextValue(this.pullRefs)
      : [{ kind: "head", ref: `refs/pull/${number}/head`, sha: this.lastPullHeadSha }];
  }

  getUnresolvedReviewThreads(number) {
    this.calls.push(["getUnresolvedReviewThreads", number]);
    const value = nextValue(this.reviewThreads);
    if (value instanceof Error) {
      throw value;
    }
    return value;
  }

  deleteBranchRef(branchName) {
    this.calls.push(["deleteBranchRef", branchName]);
    if (this.deleteBranchError) {
      throw this.deleteBranchError;
    }
  }

  wait() {
    this.calls.push(["wait"]);
  }
}

function createFixtureLocalGit(result = { branch: "deleted", currentCheckout: "switched_to_default" }) {
  const calls = [];
  return {
    calls,
    cleanupBranch(branchName, defaultBranch, options) {
      calls.push([branchName, defaultBranch, options]);
      return result;
    },
  };
}

const immediateOptions = {
  ciRunPollLimit: 2,
  issuePollLimit: 2,
  pollLimit: 8,
  pollMs: 0,
  updatePollLimit: 2,
};

test("waits for stale PR and temporary head refs to converge", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }],
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-2" }],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await waitForHeadConvergence(
    client,
    {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    },
  );

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(client.calls.filter(([name]) => name === "wait"), [["wait"]]);
  assert.equal(client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)), false);
});

test("uses the converged SHA for CI, merge, and cleanup", async () => {
  const client = new FixtureClient({
    pulls: [
      pull({ headSha: "head-1", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    pullRefs: [
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }],
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-2" }],
    ],
    refs: [{ sha: "head-2" }, null],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await completePullRequest(client, { ...immediateOptions, pushedHead: "head-2" });

  assert.equal(result.acceptedHead, "head-2");
  assert.equal(client.calls.filter(([name]) => name === "getCiWorkflowRuns").every(([, sha]) => sha === "head-2"), true);
  assert.deepEqual(client.calls.filter(([name]) => name === "mergePullRequest"), [["mergePullRequest", 24, "head-2"]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [["deleteBranchRef", "codex/24-complete-pr"]]);
});

test("stops after bounded stale-head convergence without writes", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-1", isDraft: false }), pull({ headSha: "head-1", isDraft: false })],
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(
      client,
      {
        expectedHead: "head-2",
        initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
        options: { headPollLimit: 2, pollMs: 0 },
        repository: client.repositoryDetails,
      },
    ),
    { code: "head_convergence_timeout", message: /head-2.*head-1/ },
  );
  assert.equal(client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)), false);
});

test("stops when the source branch moves during convergence", async () => {
  const client = new FixtureClient({
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-3" }],
  });

  await assert.rejects(
    waitForHeadConvergence(
      client,
      {
        expectedHead: "head-2",
        initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
        options: { headPollLimit: 2, pollMs: 0 },
        repository: client.repositoryDetails,
      },
    ),
    { code: "head_branch_changed", message: /head-2.*head-3/ },
  );
});

test("rejects a generated merge ref that omits the synchronized source parent", async () => {
  const client = new FixtureClient({
    commits: { "merge-ref": { parents: ["base-1", "other-head"], sha: "merge-ref" } },
    pullRefs: [[
      { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
      { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
    ]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(
      client,
      {
        expectedHead: "head-2",
        initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
        options: { headPollLimit: 1, pollMs: 0 },
        repository: client.repositoryDetails,
      },
    ),
    { code: "head_merge_ref_mismatch", message: /head-2/ },
  );
});

test("retries a stale generated merge ref until the synchronized source parent appears", async () => {
  const client = new FixtureClient({
    commits: {
      "merge-old": { parents: ["base-1", "head-1"], sha: "merge-old" },
      "merge-new": { parents: ["base-1", "head-2"], sha: "merge-new" },
    },
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-1" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-old" },
      ],
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-new" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await waitForHeadConvergence(client, {
    expectedHead: "head-2",
    initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
    options: { headPollLimit: 2, pollMs: 0 },
    repository: client.repositoryDetails,
  });

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(client.calls.filter(([name]) => name === "wait"), [["wait"]]);
});

test("stops on missing temporary head evidence", async () => {
  const client = new FixtureClient({
    pullRefs: [[]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_convergence_timeout", message: /<missing>/ },
  );
  assert.equal(client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)), false);
});

test("stops on a temporary-ref provider read failure", async () => {
  const client = new FixtureClient({ sourceRefs: [{ sha: "head-2" }] });
  const failure = new Error("HTTP 503: temporary ref read failed");
  client.getPullRequestRefs = () => {
    throw failure;
  };

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    {
      code: "head_convergence_provider_error",
      message: /temporary pull-request refs.*expected synchronized SHA head-2.*HTTP 503: temporary ref read failed.*source branch head-2.*PR API head head-2.*refs\/pull\/24\/head <unread>/,
    },
  );
  assert.equal(client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)), false);
});

test("includes identities when a synthetic merge ref read fails", async () => {
  const client = new FixtureClient({
    pullRefs: [[
      { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
      { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
    ]],
    sourceRefs: [{ sha: "head-2" }],
  });
  const failure = new Error("HTTP 503: synthetic merge ref read failed");
  client.getCommit = () => {
    throw failure;
  };

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    {
      code: "head_convergence_provider_error",
      message: /synthetic merge ref.*expected synchronized SHA head-2.*HTTP 503: synthetic merge ref read failed.*source branch head-2.*PR API head head-2.*refs\/pull\/24\/head head-2/,
    },
  );
  assert.equal(client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)), false);
});

test("normalizes the narrow REST pull request payload used by the completion loop", () => {
  assert.deepEqual(
    normalizePullRequest({
      base: { ref: "master", sha: "base-1" },
      draft: true,
      head: { ref: "codex/24-complete-pr", sha: "head-1", repo: { full_name: "owner/repo" } },
      html_url: "https://github.com/owner/repo/pull/24",
      merge_commit_sha: null,
      mergeable: true,
      mergeable_state: "blocked",
      number: 24,
      state: "open",
    }, "owner/repo"),
    {
      baseBranch: "master",
      baseSha: "base-1",
      headBranch: "codex/24-complete-pr",
      headRepository: "owner/repo",
      headSha: "head-1",
      isCrossRepository: false,
      isDraft: true,
      mergeCommitSha: null,
      mergeState: "BLOCKED",
      mergeable: "MERGEABLE",
      number: 24,
      state: "OPEN",
      url: "https://github.com/owner/repo/pull/24",
    },
  );
});

test("normalizes closed REST pull requests only when merged_at is populated", () => {
  assert.equal(normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state, "MERGED");
  assert.equal(normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state, "CLOSED");
});

test("reads linked Project statuses through REST without GraphQL", () => {
  const calls = [];
  const responses = new Map([
    ["users/owner/projectsV2?per_page=100", "[[{\"number\":2,\"state\":\"open\"}]]"],
    ["users/owner/projectsV2/2/items?per_page=100", JSON.stringify(projectItemIdentity(linkedProjectItem(1701)))],
    ["users/owner/projectsV2/2/fields?per_page=100", "[[{\"id\":407,\"name\":\"Status\",\"data_type\":\"single_select\"}]]"],
    ["users/owner/projectsV2/2/items/1701?fields=407", "{\"id\":1701,\"node_id\":\"PVTI_item-1701\",\"content\":{\"number\":24,\"repository\":{\"full_name\":\"owner/repo\"},\"repository_url\":\"https://api.github.com/repos/owner/repo\"},\"fields\":[{\"id\":407,\"name\":\"Status\",\"value\":{\"id\":\"done\",\"name\":{\"raw\":\"Done\"}}}]}"],
  ]);
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && (value.startsWith("users/") || value.startsWith("orgs/")));
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  });

  assert.deepEqual(client.getIssueProjectStatuses(24), ["Done"]);
  const itemCall = calls.find((args) => args.includes("users/owner/projectsV2/2/items?per_page=100"));
  assert.deepEqual(itemCall.slice(0, 3), ["api", "--paginate", "--jq"]);
  for (const field of [
    ".id",
    ".node_id",
    ".content.number",
    ".content.repository.full_name",
    ".content.repository.fullName",
    ".content.repository_url",
  ]) {
    assert.match(itemCall[3], new RegExp(field.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(itemCall[3], /\.content\.(body|title|user)/);
  assert.equal(itemCall.at(-1), "users/owner/projectsV2/2/items?per_page=100");
  assert.deepEqual(calls.filter((args) => args !== itemCall), [
    ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"],
    ["api", "--paginate", "--slurp", "users/owner/projectsV2/2/fields?per_page=100"],
    ["api", "users/owner/projectsV2/2/items/1701?fields=407"],
  ]);
  assert.equal(calls.some((args) => args.includes("graphql") || args.includes("issue")), false);
});

test("follows every Link-paginated Project item page without changing live IDs", () => {
  const firstPage = [linkedProjectItem(1700, 23)];
  const secondPage = [linkedProjectItem(1701)];
  const { reader, calls } = createProjectStatusReader({
    itemPagesByProject: new Map([["2", [firstPage, secondPage]]]),
  });

  assert.deepEqual(reader.getIssueProjectStatuses(24), ["Done"]);
  const itemCall = calls.find((args) => args.some((value) => String(value).includes("/items?")));
  assert.ok(itemCall.includes("--paginate"));
  assert.ok(itemCall.includes("--jq"));
  assert.equal(itemCall.includes("--slurp"), false);
  assert.match(itemCall.find((value) => String(value).includes(".content.number")), /\.content\.repository/);
  assert.equal(itemCall.some((value) => /[?&]page=/.test(String(value))), false);
  assert.equal(calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields=407"))), true);
});

test("rejects contradictory membership identity and stale item readback", () => {
  const contradictory = linkedProjectItem(1701);
  contradictory.content.repository_url = "https://api.github.com/repos/other/repo";
  const { reader: contradictoryReader } = createProjectStatusReader({
    itemPagesByProject: new Map([["2", [[contradictory]]]]),
  });
  assert.throws(() => contradictoryReader.getIssueProjectStatuses(24), /non-contradictory repository identity/);

  const { reader: staleReader } = createProjectStatusReader({
    itemResponses: new Map([["2/1701", projectStatusResponse("Done", 1702)]]),
  });
  assert.throws(() => staleReader.getIssueProjectStatuses(24), /same Project item IDs/);
});

test("rejects malformed Project membership identity before status readback", () => {
  const missingContent = linkedProjectItem(1701);
  missingContent.content = undefined;
  const missingIssueNumber = linkedProjectItem(1701);
  missingIssueNumber.content.number = undefined;
  const blankRepository = linkedProjectItem(1701);
  blankRepository.content.repository.full_name = "   ";
  blankRepository.content.repository_url = undefined;
  const invalidRepositoryUrl = linkedProjectItem(1701);
  invalidRepositoryUrl.content.repository_url = "https://example.test/repos/owner/repo";
  const cases = [
    { item: { ...linkedProjectItem(1701), id: undefined }, error: /items with IDs/ },
    { item: { ...linkedProjectItem(1701), node_id: undefined }, error: /items with global IDs/ },
    { item: missingContent, error: /repository identity/ },
    { item: missingIssueNumber, error: /valid issue number/ },
    { item: blankRepository, error: /non-blank repository identity/ },
    { item: invalidRepositoryUrl, error: /canonical repository URL/ },
  ];

  for (const { item, error } of cases) {
    const { reader, calls } = createProjectStatusReader({ itemsByProject: new Map([["2", [item]]]) });
    assert.throws(() => reader.getIssueProjectStatuses(24), error);
    assert.equal(calls.some((args) => args.some((value) => String(value).includes("/fields?"))), false);
    assert.equal(calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields="))), false);
  }
});

test("rejects contradictory repository identity casing before status readback", () => {
  const contradictory = linkedProjectItem(1701);
  contradictory.content.repository.fullName = "other/repo";
  const { reader, calls } = createProjectStatusReader({
    itemsByProject: new Map([["2", [contradictory]]]),
  });

  assert.throws(() => reader.getIssueProjectStatuses(24), /one non-contradictory repository identity/);
  assert.equal(calls.some((args) => args.some((value) => String(value).includes("/fields?"))), false);
  assert.equal(calls.some((args) => args.some((value) => String(value).includes("/items/1701?fields="))), false);
});

test("rejects two open linked Projects even when their statuses disagree", () => {
  const { reader, calls } = createProjectStatusReader({
    projects: [
      { number: 2, state: "open" },
      { number: 3, state: "open" },
    ],
    itemsByProject: new Map([
      ["2", [linkedProjectItem(1701)]],
      ["3", [linkedProjectItem(1702)]],
    ]),
    fieldsByProject: new Map([
      ["2", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]],
      ["3", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]],
    ]),
    itemResponses: new Map([
      ["2/1701", projectStatusResponse("Done")],
      ["3/1702", projectStatusResponse("In Progress")],
    ]),
  });

  assert.throws(() => reader.getIssueProjectStatuses(24), /exactly one open linked Project/);
  assert.equal(calls.some((args) => args.some((value) => String(value).includes("/fields?"))), false);
});

test("rejects duplicate matching issue items before status readback", () => {
  const { reader, calls } = createProjectStatusReader({
    itemsByProject: new Map([["2", [linkedProjectItem(1701), linkedProjectItem(1702)]]]),
  });

  assert.throws(() => reader.getIssueProjectStatuses(24), /exactly one matching issue item/);
  assert.equal(calls.some((args) => args.some((value) => String(value).includes("/fields?"))), false);
});

test("rejects missing, blank, and contradictory Status values", () => {
  const responses = [
    { fields: [] },
    { fields: [{ id: PROJECT_STATUS_FIELD_ID, name: "Status", value: { name: { raw: "   " } } }] },
    { fields: [{
      id: PROJECT_STATUS_FIELD_ID,
      name: "Status",
      value: { name: { raw: "Done", html: "In Progress" } },
    }] },
  ];

  for (const itemResponse of responses) {
    const { reader } = createProjectStatusReader({ itemResponses: new Map([["2/1701", {
      ...linkedProjectItem(1701),
      ...itemResponse,
    }]]) });
    assert.throws(() => reader.getIssueProjectStatuses(24), /Status field\/value/);
  }
});

test("stops on a Project item rate-limit response", () => {
  const { reader } = createProjectStatusReader({ rateLimitedProjects: new Set(["2"]) });

  assert.throws(() => reader.getIssueProjectStatuses(24), /rate limit/i);
});

test("maps linked closing issues from paginated REST pull data without GraphQL", () => {
  const calls = [];
  const responses = new Map([
    ["repos/owner/repo/pulls/24", JSON.stringify({ body: "Closes #24" })],
    ["repos/owner/repo/pulls/24/commits?per_page=100", JSON.stringify([[{
      commit: { message: "Fixes other/repo#7" },
    }]])],
    ["repos/owner/repo/issues/24", JSON.stringify({ state: "closed", html_url: "https://github.com/owner/repo/issues/24" })],
    ["repos/other/repo/issues/7", JSON.stringify({ state: "closed", html_url: "https://github.com/other/repo/issues/7" })],
  ]);
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  });

  assert.deepEqual(client.getLinkedIssues(24), [
    { number: 24, state: "CLOSED", url: "https://github.com/owner/repo/issues/24" },
    { number: 7, state: "CLOSED", url: "https://github.com/other/repo/issues/7" },
  ]);
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo/pulls/24"],
    ["api", "--paginate", "--slurp", "repos/owner/repo/pulls/24/commits?per_page=100"],
    ["api", "repos/owner/repo/issues/24"],
    ["api", "repos/other/repo/issues/7"],
  ]);
  assert.equal(calls.some((args) => args.includes("graphql") || args.includes("pr")), false);
});

test("lists ci.yml workflow runs for the trusted head SHA", () => {
  const calls = [];
  const run = workflowRun("head-1");
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ [workflowRunsField]: [run] }),
    };
  });

  assert.deepEqual(client.getCiWorkflowRuns("head-1"), [run]);
  assert.deepEqual(calls, [[
    "api",
    "--paginate",
    "--slurp",
    "repos/owner/repo/actions/workflows/ci.yml/runs?" +
      "head_sha=head-1&per_page=100",
  ]]);
});

test("rejects malformed ci.yml workflow responses", () => {
  for (const response of [{}, []]) {
    const client = new GitHubClient("owner/repo", 24, () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    }));

    assert.throws(() => client.getCiWorkflowRuns("head-1"), {
      code: "github_response_shape",
      name: "CompletionError",
      message: workflowRunsPattern,
    });
  }
});

test(
  "dispatches ci.yml through workflow_dispatch at the checked branch",
  () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "" };
  });

  client.dispatchCiWorkflow("codex/24-complete-pr");

  assert.deepEqual(calls, [[
    "api",
    "--method",
    "POST",
    "repos/owner/repo/actions/workflows/ci.yml/dispatches",
    "-f",
    "ref=codex/24-complete-pr",
  ]]);
  },
);

test(
  "recovers missing ci.yml and completes after exact-head checks pass",
  async () => {
    const client = new FixtureClient({
      clientRepository: "owner/repo",
      workflowRuns: [[], [workflowRun("head-1", { path: ".github/workflows/ci.yml" })]],
      checks: [passingChecks],
      refs: [{ sha: "head-1" }, { sha: "head-1" }, null],
      pulls: [
        pull(),
        pull({ isDraft: false }),
        pull({ isDraft: false }),
        pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
      ],
    });

    const result = await completePullRequest(client, immediateOptions);

    assert.equal(client.repository, "owner/repo");
    assert.deepEqual(
      client.calls.filter(([name]) => name === "dispatch"),
      [["dispatch", "codex/24-complete-pr"]],
    );
    assert.deepEqual(
      client.calls.filter(([name]) => name === "getCiWorkflowRuns"),
      [
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
      ],
    );
    assert.deepEqual(client.calls.filter(([name]) => name === "getRequiredChecks"), [
      ["getRequiredChecks"],
    ]);
    assert.equal(result.acceptedHead, "head-1");
    assert.equal(result.mergeCommitSha, "merge-1");
    assert.equal(result.branch, "deleted");
  },
);

test("accepts one exact-head ci.yml run for each trigger event", async () => {
  const client = new FixtureClient({
    workflowRuns: [[
      workflowRun("head-1", { event: "push" }),
      workflowRun("head-1", { event: "pull_request" }),
    ]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.ok(client.calls.some(([name]) => name === "getCiWorkflowRuns"));
});

test("recovers an already-merged pull request through guarded remote and local cleanup", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "deleted");
  assert.equal(result.local.branch, "deleted");
  assert.equal(result.local.currentCheckout, "switched_to_default");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [["deleteBranchRef", "codex/24-complete-pr"]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "getBranchRef"), [
    ["getBranchRef", "codex/24-complete-pr"],
    ["getBranchRef", "codex/24-complete-pr"],
  ]);
});

test("recovers merged cleanup when the remote source branch is already absent", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [null],
    sourceRefs: [null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "already_absent");
  assert.deepEqual(client.calls.filter(([name]) => name === "getSourceBranchRef"), [
    ["getSourceBranchRef", "codex/24-complete-pr"],
  ]);
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
});

test("dry-runs merged pull-request recovery without cleanup mutation", async () => {
  const localGit = createFixtureLocalGit({ branch: "would_delete", currentCheckout: "would_switch_to_default" });
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, dryRun: true, localGit });

  assert.equal(result.branch, "would_delete");
  assert.equal(result.local.branch, "would_delete");
  assert.equal(result.local.currentCheckout, "would_switch_to_default");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: true }]]);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("stops before local cleanup when trusted remote deletion is not confirmed", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, { sha: "head-1" }],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "branch_delete_unconfirmed",
  });

  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
  assert.equal(localGit.calls.length, 0);
});

test("treats an ambiguous remote branch deletion as successful after absent readback", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    deleteBranchError: new Error("connection reset"),
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "deleted");
  assert.deepEqual(client.calls.filter(([name]) => name === "getBranchRef"), [
    ["getBranchRef", "codex/24-complete-pr"],
    ["getBranchRef", "codex/24-complete-pr"],
  ]);
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
});

test("preserves a remote branch when deletion fails and readback still finds the trusted ref", async () => {
  const localGit = createFixtureLocalGit();
  const failure = new Error("remote branch delete failed");
  const client = new FixtureClient({
    deleteBranchError: failure,
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, { sha: "head-1" }],
  });

  await assert.rejects(
    recoverMergedPullRequest(client, { ...immediateOptions, localGit }),
    failure,
  );
  assert.equal(localGit.calls.length, 0);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
});

test("refuses merged recovery when a linked issue is not Done in its Project", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    projectStatuses: [[]],
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), { code: "project_not_done" });
  assert.equal(localGit.calls.length, 0);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("does not authorize cleanup unless the sole Project status is Done", async () => {
  for (const statuses of [["Done", "In Progress"], ["Done", "Done"], [], [" "]]) {
    const localGit = createFixtureLocalGit();
    const client = new FixtureClient({
      projectStatuses: [statuses],
      pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    });

    await assert.rejects(
      recoverMergedPullRequest(client, { ...immediateOptions, localGit }),
      { code: "project_not_done" },
    );
    assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
    assert.equal(localGit.calls.length, 0);
  }
});

test("waits for required checks, confirms merge, and deletes the trusted remote branch", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = normalizePullRequest(
    { state: "closed", merged_at: "2026-09-12T13:47:19Z" },
    "owner/repo",
  ).state;
  const client = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(result.local, { branch: "deleted", currentCheckout: "switched_to_default" });
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "markReady"), [["markReady", 24]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
});

test("waits for all four repository required checks before trusted cleanup", async () => {
  const requiredChecks = requiredCheckNames.map((name) => ({ bucket: "pending", name, state: "IN_PROGRESS" }));
  const passingRequiredChecks = requiredCheckNames.map((name) => ({ bucket: "pass", name, state: "SUCCESS" }));
  const client = new FixtureClient({
    checks: [requiredChecks, passingRequiredChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
});

test("treats skipped required checks as passing", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "skipping", name: "build-test", state: "SKIPPED" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("treats a skipped required check alongside passing checks as complete", async () => {
  const client = new FixtureClient({
    checks: [[
      { bucket: "skipping", name: "build-test", state: "SKIPPED" },
      { bucket: "pass", name: "plugin-config", state: "SUCCESS" },
      { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
      { bucket: "pass", name: "package-integrity", state: "SUCCESS" },
    ]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("reports the fallback reason for unsupported required-check evidence", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /PROVIDER_MISMATCH/,
  });
});

test("stops on missing fallback evidence without merge or branch cleanup", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /MISSING/,
  });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
  assert.equal(client.calls.some(([name]) => name === "dispatch"), false);
});

test("stops without merge or branch cleanup after required-check read failure", async () => {
  const localGit = createFixtureLocalGit();
  const failure = new Error("HTTP 500: transient provider failure");
  const client = new FixtureClient({
    requiredChecksError: failure,
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, localGit }), failure);
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
  assert.equal(localGit.calls.length, 0);
});

test(
  "dispatches missing ci.yml once after verifying the same-repository " +
    "branch head",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], [workflowRun("head-1")]],
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 1 }),
    { code: "unknown_check_state" },
  );

  const dispatches = client.calls.filter(([name]) => name === "dispatch");
  assert.deepEqual(dispatches, [["dispatch", "codex/24-complete-pr"]]);
  const branchRefIndex = client.calls.findIndex(
    ([name]) => name === "getBranchRef",
  );
  const dispatchIndex = client.calls.findIndex(([name]) => name === "dispatch");
  assert.ok(branchRefIndex >= 0);
  assert.ok(branchRefIndex < dispatchIndex);
  const dispatchCall = client.calls.findIndex(([name]) => name === "dispatch");
  const requiredChecksCall = client.calls.findIndex(
    ([name]) => name === "getRequiredChecks",
  );
  assert.ok(dispatchCall < requiredChecksCall);
  },
);

test(
  "leaves a pending ci.yml run pending instead of accepting missing job checks",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [
      [workflowRun("head-1", { conclusion: null, status: "queued" })],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1")],
    ],
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 4 }),
    { code: "unknown_check_state" },
  );

  const requiredChecksCalls = client.calls.filter(
    ([name]) => name === "getRequiredChecks",
  );
  assert.equal(requiredChecksCalls.length, 1);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 3);
  assert.equal(client.calls.some(([name]) => name === "dispatch"), false);
  const autoMergeIndex = client.calls.findIndex(
    ([name]) => name === "enableRepositoryAutoMerge",
  );
  const workflowReads = client.calls
    .slice(0, autoMergeIndex)
    .filter(([name]) => name === "getCiWorkflowRuns");
  assert.equal(workflowReads.length, 4);
  },
);

test(
  "does not merge when an exact-head ci.yml run stays pending",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[
      workflowRun("head-1", { conclusion: null, status: "in_progress" }),
    ]],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /remained pending/,
  });

  const workflowReads = client.calls.filter(
    ([name]) => name === "getCiWorkflowRuns",
  );
  assert.equal(workflowReads.length, 2);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "getRequiredChecks"),
    false,
  );
  },
);

test(
  "fails before REST merge when no exact-head ci.yml run appears " +
    "after dispatch",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /head-1/,
  });
  assert.deepEqual(client.calls.filter(([name]) => name === "dispatch"), [
    ["dispatch", "codex/24-complete-pr"],
  ]);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  },
);

test(
  "does not dispatch for a forked PR or a branch that moved from the " +
    "trusted head",
  async () => {
  const forked = new FixtureClient({
    pulls: [pull({ headRepository: "fork/repo", isCrossRepository: true })],
  });
  await assert.rejects(
    completePullRequest(forked, immediateOptions),
    { code: "cross_repository_head" },
  );
  assert.equal(forked.calls.some(([name]) => name === "dispatch"), false);

  const moved = new FixtureClient({
    workflowRuns: [[]],
    refs: [{ sha: "new-head" }],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(completePullRequest(moved, immediateOptions), {
    code: "ci_branch_head_mismatch",
    message: /head-1.*new-head/,
  });
  assert.equal(moved.calls.some(([name]) => name === "dispatch"), false);
  assert.equal(
    moved.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );

  const missingBranch = new FixtureClient({
    workflowRuns: [[]],
    refs: [null],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(
    completePullRequest(missingBranch, immediateOptions),
    { code: "ci_branch_not_found" },
  );
  assert.equal(
    missingBranch.calls.some(([name]) => name === "dispatch"),
    false,
  );
  },
);

test(
  "fails closed for duplicate, stale, wrong-workflow, failed, cancelled, " +
    "and unsupported ci.yml runs",
  async () => {
  const cases = [
    {
      code: "duplicate_ci_workflow_run",
      runs: [
        workflowRun("head-1", { event: "push" }),
        workflowRun("head-1", { event: "push" }),
      ],
    },
    { code: "stale_ci_workflow_run", runs: [workflowRun("old-head")] },
    {
      code: "unrelated_ci_workflow_run",
      runs: [
        workflowRun("head-1", {
          path: ".github/workflows/other.yml@refs/heads/main",
        }),
      ],
    },
    {
      code: "unrelated_ci_workflow_run",
      runs: [workflowRun("head-1", { path: ".github/workflows/ci.yml.bak" })],
    },
    {
      code: "ci_workflow_failed",
      runs: [workflowRun("head-1", { conclusion: "failure" })],
    },
    {
      code: "ci_workflow_failed",
      runs: [workflowRun("head-1", { conclusion: "cancelled" })],
    },
    {
      code: "unknown_ci_workflow_state",
      runs: [workflowRun("head-1", { status: "unexpected" })],
    },
    { code: "unknown_ci_workflow_state", runs: [null] },
  ];

  for (const { code, runs } of cases) {
    const client = new FixtureClient({
      workflowRuns: [runs],
      pulls: [pull(), pull({ isDraft: false })],
    });

    await assert.rejects(
      completePullRequest(client, immediateOptions),
      { code },
    );
    assert.equal(
      client.calls.some(([name]) => name === "mergePullRequest"),
      false,
    );
  }
  },
);

test(
  "reads back after an ambiguous dispatch and never dispatches twice",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [
      [],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1")],
    ],
    workflowDispatchError: new Error("connection reset"),
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    { code: "unknown_check_state" },
  );
  assert.deepEqual(client.calls.filter(([name]) => name === "dispatch"), [
    ["dispatch", "codex/24-complete-pr"],
  ]);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
  },
);

test(
  "stops after a rejected dispatch and exact-head readback finds no run",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    workflowDispatchError: new Error(
      "HTTP 403: Actions write permission is required",
    ),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_dispatch_failed",
    message: /HTTP 403.*no exact-head run/,
  });
  assert.equal(client.calls.filter(([name]) => name === "dispatch").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  },
);

test("rejects a pull request whose base changes before fallback verification", async () => {
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ baseBranch: "release", isDraft: false }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "wrong_base_branch" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("does not run cleanup for a closed pull request without merged_at", async () => {
  const closedState = normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state;
  const client = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, state: closedState }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "pull_request_closed" });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("stops before REST merge when the ready transition leaves a draft", async () => {
  const client = new FixtureClient({ pulls: [pull(), pull()] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "ready_transition_failed" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
});

test("stops before REST merge when marking a draft ready fails", async () => {
  const client = new FixtureClient({ pulls: [pull()] });
  client.markReady = () => {
    throw new Error("gh pr ready failed");
  };

  await assert.rejects(completePullRequest(client, immediateOptions), { message: "gh pr ready failed" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
});

test("marks a draft pull request ready through GraphQL and verifies draft state", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    if (args.includes("graphql")) {
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } },
        }),
      };
    }
    return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: "PR_kw123" }) };
  });

  client.markReady(24);

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/pulls/24"]);
  assert.equal(calls[1][0], "api");
  assert.equal(calls[1][1], "graphql");
  assert.match(calls[1][3], /markPullRequestReadyForReview/);
  assert.match(calls[1][3], /isDraft/);
  assert.deepEqual(calls[1].slice(-2), ["-F", "pullRequestId=PR_kw123"]);

  const draftClient = new GitHubClient("owner/repo", 24, (args) => ({
    status: 0,
    stderr: "",
    stdout: args.includes("graphql")
      ? JSON.stringify({
        data: { markPullRequestReadyForReview: { pullRequest: { isDraft: true } } },
      })
      : JSON.stringify({ node_id: "PR_kw123" }),
  }));
  assert.throws(() => draftClient.markReady(24), { code: "ready_transition_failed" });
});

test("surfaces failures from the GraphQL ready request", () => {
  const failure = new Error("GraphQL ready mutation failed");
  const client = new GitHubClient("owner/repo", 24, (args) => {
    if (args.includes("graphql")) {
      throw failure;
    }
    return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: "PR_kw123" }) };
  });

  assert.throws(() => client.markReady(24), failure);
});

test("merges a pull request through REST with the expected head SHA", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ merged: true, sha: "merge-1", message: "Pull Request successfully merged" }),
    };
  });

  assert.deepEqual(client.mergePullRequest(24, "head-1"), {
    merged: true,
    sha: "merge-1",
    message: "Pull Request successfully merged",
  });
  assert.deepEqual(calls, [[
    "api",
    "--method",
    "PUT",
    "repos/owner/repo/pulls/24/merge",
    "-f",
    "sha=head-1",
    "-f",
    "merge_method=merge",
  ]]);
});

test("preserves a failed REST merge after an open pull-request readback", () => {
  const failure = new Error("HTTP 409: Pull Request is not mergeable");
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    if (args.some((value) => String(value).endsWith("/merge"))) {
      throw failure;
    }
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ state: "open", head: { sha: "head-1", repo: { full_name: "owner/repo" } } }),
    };
  });

  assert.throws(() => client.mergePullRequest(24, "head-1"), failure);
  assert.deepEqual(calls.map((args) => args.at(-1)), [
    "merge_method=merge",
    "repos/owner/repo/pulls/24",
  ]);
});

test("accepts an ambiguous REST merge once the exact head reads back merged", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    if (args.some((value) => String(value).endsWith("/merge"))) {
      throw new Error("connection reset");
    }
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        state: "closed",
        merged_at: "2026-09-28T01:00:00Z",
        head: { sha: "head-1", repo: { full_name: "owner/repo" } },
        merge_commit_sha: "merge-1",
      }),
    };
  });

  assert.deepEqual(client.mergePullRequest(24, "head-1"), { merged: true, sha: "merge-1" });
  assert.equal(calls.length, 2);
});

test("accepts an already-ready pull request without marking it ready again", async () => {
  const client = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(client.calls.some(([name]) => name === "markReady"), false);
});

test("accepts repeated guarded base updates and merges the final trusted head", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks, pendingChecks, passingChecks],
    commits: {
      "head-2": { parents: ["head-1", "base-1"], sha: "head-2" },
      "head-3": { parents: ["head-2", "base-2"], sha: "head-3" },
    },
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-1", headSha: "head-2", isDraft: false }),
      pull({ baseSha: "base-2", headSha: "head-2", isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-2", headSha: "head-3", isDraft: false }),
      pull({ baseSha: "base-2", headSha: "head-3", isDraft: false }),
      pull({ headSha: "head-3", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "head-3" }, null],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.trustedHead, "head-3");
  assert.deepEqual(client.calls.filter(([name]) => name === "updateBranch"), [
    ["updateBranch", 24, "head-1"],
    ["updateBranch", 24, "head-2"],
  ]);
  assert.deepEqual(client.calls.filter(([name]) => name === "mergePullRequest"), [
    ["mergePullRequest", 24, "head-3"],
  ]);
});

test("stops on a merge conflict", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "DIRTY", mergeable: "CONFLICTING" }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "merge_conflict" });
});

test("stops on failed or cancelled required checks", async () => {
  await Promise.all(
    ["fail", "cancel"].map(async (bucket) => {
      const client = new FixtureClient({
        checks: [[{ bucket, name: "static-analysis", state: bucket.toUpperCase() }]],
        pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
      });

      await assert.rejects(completePullRequest(client, immediateOptions), { code: "required_check_failed" });
    }),
  );
});

test("stops when the head changes outside a guarded base update", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ headSha: "unexpected", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unexpected_head_change" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
});

test("surfaces repository permission failures before enabling pull request auto-merge", async () => {
  const client = new FixtureClient({
    enableRepositoryError: new Error("HTTP 403: auto-merge requires administration permission"),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    PERMISSION_ERROR,
  );
  assert.equal(client.calls.some(([name]) => name === "mergePullRequest"), false);
});

test("refuses to delete a remote branch whose ref changed after merge", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "unexpected" }],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, localGit }), { code: "branch_ref_changed" });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
  assert.equal(localGit.calls.length, 0);
});

test("rejects an update commit that is not the observed head and base merge", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks],
    commits: { "head-2": { parents: ["head-1", "other-base"], sha: "head-2" } },
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "BEHIND" }),
      pull({ headSha: "head-2", isDraft: false }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "untrusted_base_update" });
});

test("merges a draft with green checks and no unresolved thread without any Codex read or wait", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = "MERGED";
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.trustedHead, "head-1");
  assert.deepEqual(client.calls.filter(([name]) => name === "markReady"), [["markReady", 24]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "mergePullRequest"), [["mergePullRequest", 24, "head-1"]]);
  assert.equal(client.calls.some(([name]) => name === "wait"), false);
  const threadReads = client.calls.filter(([name]) => name === "getUnresolvedReviewThreads");
  assert.equal(threadReads.length, 2);
  assert.ok(client.calls.indexOf(threadReads[0]) < client.calls.findIndex(([name]) => name === "markReady"));
  assert.deepEqual(Object.getOwnPropertyNames(GitHubClient.prototype).filter((name) => codexMethodPattern.test(name)), []);
});

for (const [label, pullRequest] of [["draft", pull()], ["ready", pull({ isDraft: false })]]) {
  test(`stops a ${label} pull request with an unresolved review thread before any mutation`, async () => {
    const client = new FixtureClient({
      pulls: [pullRequest],
      reviewThreads: [[unresolvedThread()]],
      workflowRuns: [[]],
    });

    const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

    assert.equal(failure.code, "unresolved-review-threads");
    assert.match(failure.message, discussionUrlPattern);
    assert.match(failure.message, sourcePathPattern);
    assert.deepEqual(client.calls.filter(([name]) => mutationCallNames.includes(name)), []);
  });
}

test("a thread opened during the required-check wait stops before the merge, and a rerun after it is resolved merges once", async () => {
  const mergedState = "MERGED";
  const firstRun = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    reviewThreads: [[], [unresolvedThread()]],
  });

  await assert.rejects(completePullRequest(firstRun, immediateOptions), { code: "unresolved-review-threads" });
  assert.equal(firstRun.calls.some(([name]) => name === "wait"), true);
  assert.equal(firstRun.calls.some(([name]) => name === "mergePullRequest"), false);

  const rerun = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(rerun, { ...immediateOptions, localGit: createFixtureLocalGit() });

  assert.deepEqual(rerun.calls.filter(([name]) => name === "mergePullRequest"), [["mergePullRequest", 24, "head-1"]]);
  assert.equal(result.trustedHead, "head-1");
});

test("a thread read that throws stops with review-threads-unavailable before any mutation", async () => {
  const client = new FixtureClient({
    pulls: [pull()],
    reviewThreads: [new Error("GraphQL request timed out")],
    workflowRuns: [[]],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "review-threads-unavailable" });
  assert.deepEqual(client.calls.filter(([name]) => mutationCallNames.includes(name)), []);
});

test("a reader-reported review-threads-unavailable error stops before any mutation", async () => {
  const client = new FixtureClient({
    pulls: [pull()],
    reviewThreads: [
      new CompletionError("review-threads-unavailable", "Review threads for pull request #24 could not be read."),
    ],
    workflowRuns: [[]],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "review-threads-unavailable" });
  assert.deepEqual(client.calls.filter(([name]) => mutationCallNames.includes(name)), []);
});
