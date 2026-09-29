import assert from "node:assert/strict";
import test from "node:test";
import { runTransport } from "../../../lib/transport-policy.mjs";
import { GitHubClient } from "./lib/github-client.mjs";
import { writeProjectStatuses, writeProjectStatusesWithFallback } from "./project-status.mjs";
import {
  CHILD_NUMBERS,
  HEAD_SHA,
  ISSUE_LABELS,
  ISSUE_NUMBERS,
  ITEM_NODE_IDS,
  OWNER,
  PARENT_NUMBER,
  PROJECT_NODE_ID,
  PROJECT_NUMBER,
  PULL_NUMBER,
  REPOSITORY,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTIONS,
  createRecordingTransport,
  issueMarker,
} from "./lifecycle-fixture.mjs";

function runRest(transport, args) {
  const result = transport.commandRunner(args);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

function readProjectMembership(transport) {
  const endpoint = `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items?per_page=100`;
  const result = transport.commandRunner(["api", "--paginate", "--jq", ".[]", endpoint]);
  return result.stdout.trim() === "" ? [] : result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

async function runBoundary(context, { operation, request = {}, restEndpoint, rest }) {
  const result = await runTransport({
    operation,
    request,
    restEndpoint,
    evidence: context.transportFailures,
    primary: async () => {
      context.mcpCalls.push(operation);
      if (context.mcpRateLimited) {
        throw Object.assign(new Error("API rate limit exceeded"), { status: 429, transport: "mcp" });
      }
      return rest();
    },
    rest: async () => {
      context.restCalls.push(operation);
      return rest();
    },
  });
  return result.value;
}

function issuesWithMarker(transport, marker) {
  const issues = runRest(transport, ["api", `repos/${REPOSITORY}/issues?state=all&per_page=100`]);
  return issues.filter(({ body }) => body.includes(marker));
}

async function createIssueWithGuard(context, number) {
  const marker = issueMarker(number);
  const probe = await runBoundary(context, {
    operation: `capture-probe-${number}`,
    request: { repository: REPOSITORY, marker },
    restEndpoint: `GET /repos/${REPOSITORY}/issues?state=all&per_page=100`,
    rest: () => issuesWithMarker(context.transport, marker),
  });
  if (probe.length > 1) throw new Error(`Issue marker ${marker} is not unique.`);
  if (probe.length === 1) return probe[0];

  return runBoundary(context, {
    operation: `capture-create-${number}`,
    request: { repository: REPOSITORY, marker },
    restEndpoint: `POST /repos/${REPOSITORY}/issues`,
    rest: () => {
      let createError;
      try {
        runRest(context.transport, [
          "api",
          "--method",
          "POST",
          `repos/${REPOSITORY}/issues`,
          "-f",
          `title=Disposable fixture ${number}`,
          "-f",
          `body=Captured for REST lifecycle proof.\n\n${marker}`,
        ]);
      } catch (error) {
        createError = error;
      }
      const readback = issuesWithMarker(context.transport, marker);
      if (readback.length === 1) return readback[0];
      if (readback.length > 1) throw new Error(`Issue marker ${marker} is not unique.`, { cause: createError });
      throw new Error(`Issue create for ${marker} was unresolved after authoritative readback.`, { cause: createError });
    },
  });
}

async function ensureProjectMembership(context, issue) {
  await runBoundary(context, {
    operation: `membership-${issue.number}`,
    request: { owner: OWNER, projectNumber: PROJECT_NUMBER, issueNumber: issue.number, issueId: issue.id },
    restEndpoint: `POST /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
    rest: () => {
      const existing = readProjectMembership(context.transport).some(({ content }) => content.number === issue.number);
      if (!existing) {
        runRest(context.transport, [
          "api",
          "--method",
          "POST",
          `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
          "-F",
          `content_id=${issue.id}`,
          "-f",
          "content_type=Issue",
        ]);
      }
      const readback = readProjectMembership(context.transport).filter(({ content }) => content.number === issue.number);
      if (readback.length !== 1) throw new Error(`Project membership for issue ${issue.number} was unresolved.`);
      return readback[0];
    },
  });
}

async function assertIssueReadbacks(context, expectedLabels, expectedState = "open", phase = "issue") {
  for (const number of ISSUE_NUMBERS) {
    const issue = await runBoundary(context, {
      operation: `${phase}-read-${number}`,
      request: { repository: REPOSITORY, issueNumber: number },
      restEndpoint: `GET /repos/${REPOSITORY}/issues/${number}`,
      rest: () => runRest(context.transport, ["api", `repos/${REPOSITORY}/issues/${number}`]),
    });
    assert.equal(issue.repository.full_name, REPOSITORY);
    assert.deepEqual(issue.labels.map(({ name }) => name), expectedLabels.get(number));
    assert.equal(issue.state, expectedState);
  }
}

async function assertStatuses(context, client, expectedStatus, phase) {
  for (const number of ISSUE_NUMBERS) {
    const statuses = await runBoundary(context, {
      operation: `${phase}-status-read-${number}`,
      request: { repository: REPOSITORY, issueNumber: number },
      restEndpoint: `GET /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
      rest: () => client.getIssueProjectStatuses(number),
    });
    assert.deepEqual(statuses, [expectedStatus]);
  }
}

async function writeStatus(transport, client, expectedStatus, options) {
  const option = STATUS_OPTIONS.find((candidate) => candidate.name === expectedStatus);
  const writeOptions = {
    owner: OWNER,
    projectNumber: PROJECT_NUMBER,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: option.id,
    expectedStatus,
    itemIds: ITEM_NODE_IDS,
    commandRunner: transport.commandRunner,
  };
  const operation = `status-write-${expectedStatus.toLowerCase().replaceAll(" ", "-")}`;
  const result = options.mcpRateLimited
    ? await writeProjectStatusesWithFallback({
        ...writeOptions,
        evidence: options.transportFailures,
        primaryMutation: async () => {
          options.mcpCalls.push(operation);
          throw Object.assign(new Error("API rate limit exceeded"), { status: 429, transport: "mcp" });
        },
      })
    : writeProjectStatuses(writeOptions);
  if (options.mcpRateLimited) options.restCalls.push(operation);
  assert.deepEqual(options.mcpRateLimited ? result.value : result, {
    projectId: PROJECT_NODE_ID,
    mutations: ITEM_NODE_IDS.map((itemId) => ({ itemId, status: expectedStatus })),
  });
  await assertStatuses(options, client, expectedStatus, expectedStatus.toLowerCase().replaceAll(" ", "-"));
}

async function linkHierarchy(context, parentNumber, child) {
  await runBoundary(context, {
    operation: `hierarchy-link-${child.number}`,
    request: { repository: REPOSITORY, parentNumber, childNumber: child.number, childId: child.id },
    restEndpoint: `POST /repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (!existing.some(({ number }) => number === child.number)) {
        runRest(context.transport, ["api", "--method", "POST", endpoint, "-F", `sub_issue_id=${child.id}`]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      if (!readback.some(({ number }) => number === child.number)) {
        throw new Error(`Hierarchy link for issue ${child.number} was unresolved.`);
      }
      return readback;
    },
  });
}

async function writeIssueLabels(context, number, labels) {
  await runBoundary(context, {
    operation: `refinement-labels-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, labels },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (JSON.stringify(existing.labels.map(({ name }) => name)) !== JSON.stringify(labels)) {
        runRest(context.transport, [
          "api",
          "--method",
          "PATCH",
          endpoint,
          ...labels.flatMap((label) => ["-f", `labels[]=${label}`]),
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      assert.deepEqual(readback.labels.map(({ name }) => name), labels);
      return readback;
    },
  });
}

async function closeIssue(context, number) {
  await runBoundary(context, {
    operation: `closure-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, state: "closed" },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (existing.state !== "closed") {
        runRest(context.transport, ["api", "--method", "PATCH", endpoint, "-f", "state=closed"]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      if (readback.state !== "closed") throw new Error(`Issue ${number} closure was unresolved.`);
      return readback;
    },
  });
}

async function mergePullRequest(context, client) {
  return runBoundary(context, {
    operation: "completion-merge",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER, headSha: HEAD_SHA },
    restEndpoint: `PUT /repos/${REPOSITORY}/pulls/${PULL_NUMBER}/merge`,
    rest: () => {
      const existing = client.getPullRequest();
      if (existing.state === "MERGED") return { merged: true, sha: existing.mergeCommitSha };
      const result = client.mergePullRequest(PULL_NUMBER, HEAD_SHA);
      const readback = client.getPullRequest();
      if (readback.state !== "MERGED") throw new Error(`Pull request ${PULL_NUMBER} merge was unresolved.`);
      return result;
    },
  });
}

async function runDisposableLifecycle(options = {}) {
  const transport = createRecordingTransport(options);
  const client = new GitHubClient(REPOSITORY, PULL_NUMBER, transport.commandRunner);
  const transportOptions = { ...options, transport, mcpCalls: [], restCalls: [], transportFailures: [] };

  const repository = await runBoundary(transportOptions, {
    operation: "capture-repository",
    request: { repository: REPOSITORY },
    restEndpoint: `GET /repos/${REPOSITORY}`,
    rest: () => client.getRepository(),
  });
  assert.deepEqual(repository, {
    autoMergeAllowed: true,
    canPush: true,
    defaultBranch: "master",
    nameWithOwner: REPOSITORY,
  });
  const createdIssues = [];
  for (const number of ISSUE_NUMBERS) {
    createdIssues.push(await createIssueWithGuard(transportOptions, number));
  }
  assert.deepEqual(createdIssues.map(({ number }) => number), ISSUE_NUMBERS);

  for (const childNumber of CHILD_NUMBERS) {
    const child = createdIssues.find(({ number }) => number === childNumber);
    await linkHierarchy(transportOptions, PARENT_NUMBER, child);
  }
  const hierarchy = await runBoundary(transportOptions, {
    operation: "hierarchy-read",
    request: { repository: REPOSITORY, parentNumber: PARENT_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`,
    rest: () => runRest(transport, ["api", `repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`]),
  });
  assert.deepEqual(hierarchy.map(({ number }) => number), CHILD_NUMBERS);

  for (const issue of createdIssues) {
    await ensureProjectMembership(transportOptions, issue);
  }
  const projectMembership = (await runBoundary(transportOptions, {
    operation: "membership-read",
    request: { owner: OWNER, projectNumber: PROJECT_NUMBER },
    restEndpoint: `GET /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
    rest: () => readProjectMembership(transport),
  })).map(({ content }) => content.number).sort((a, b) => a - b);
  assert.equal(projectMembership.length, ISSUE_NUMBERS.length, "Project membership readback was incomplete.");
  assert.deepEqual(projectMembership, ISSUE_NUMBERS.slice().sort((a, b) => a - b));
  await assertIssueReadbacks(transportOptions, new Map(ISSUE_NUMBERS.map((number) => [number, []])), "open", "capture");
  await assertStatuses(transportOptions, client, "Backlog", "capture");
  if (options.alreadyAppliedStatus) await writeStatus(transport, client, options.alreadyAppliedStatus, transportOptions);

  for (const number of ISSUE_NUMBERS) {
    await writeIssueLabels(transportOptions, number, ISSUE_LABELS.get(number));
  }
  await assertIssueReadbacks(transportOptions, ISSUE_LABELS, "open", "refinement");
  await writeStatus(transport, client, "Todo", transportOptions);
  await writeStatus(transport, client, "In Progress", transportOptions);

  const pullRequest = await runBoundary(transportOptions, {
    operation: "draft-handoff-pull",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => client.getPullRequest(),
  });
  assert.equal(pullRequest.state, "OPEN");
  assert.equal(pullRequest.isDraft, false);
  assert.equal(pullRequest.headSha, HEAD_SHA);
  assert.equal(pullRequest.mergeable, "MERGEABLE");
  const checks = await runBoundary(transportOptions, {
    operation: "draft-handoff-checks",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER, headSha: HEAD_SHA },
    restEndpoint: `GET /repos/${REPOSITORY}/commits/${HEAD_SHA}/check-runs`,
    rest: () => client.getRequiredChecks(PULL_NUMBER, pullRequest),
  });
  assert.deepEqual(checks, [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
  ]);
  const reviews = await runBoundary(transportOptions, {
    operation: "draft-handoff-reviews",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`,
    rest: () => runRest(transport, ["api", `repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`]),
  });
  assert.deepEqual(reviews.map(({ state }) => state), ["APPROVED"]);
  const linkedIssues = await runBoundary(transportOptions, {
    operation: "draft-handoff-linked-issues",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => client.getLinkedIssues(PULL_NUMBER),
  });
  assert.deepEqual(
    linkedIssues.map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "OPEN" })),
  );

  assert.deepEqual(await mergePullRequest(transportOptions, client), { merged: true, sha: "merge-1" });
  for (const number of ISSUE_NUMBERS) {
    await closeIssue(transportOptions, number);
  }
  await writeStatus(transport, client, "Done", transportOptions);
  const completedPull = await runBoundary(transportOptions, {
    operation: "completion-pull-readback",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => client.getPullRequest(),
  });
  assert.equal(completedPull.state, "MERGED");
  const closedIssues = await runBoundary(transportOptions, {
    operation: "closure-linked-issues-readback",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => client.getLinkedIssues(PULL_NUMBER),
  });
  assert.deepEqual(
    closedIssues.map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "CLOSED" })),
  );
  await assertIssueReadbacks(transportOptions, ISSUE_LABELS, "closed", "closure");
  assert.equal(transport.calls.some((args) => args.some((value) => /graphql/i.test(String(value)))), false);
  return { ...transport, ...transportOptions };
}

test("proves the disposable PBI lifecycle with recording REST readbacks", async () => {
  const transport = await runDisposableLifecycle();
  assert.deepEqual(transport.transitions.map(({ status }) => status), [
    ...Array(ITEM_NODE_IDS.length).fill("Todo"),
    ...Array(ITEM_NODE_IDS.length).fill("In Progress"),
    ...Array(ITEM_NODE_IDS.length).fill("Done"),
  ]);
  assert.deepEqual(transport.transitions.slice(0, ITEM_NODE_IDS.length).map(({ itemId }) => itemId), ITEM_NODE_IDS);
});

test("reuses automatically-created Project items and skips an already-applied status", async () => {
  const transport = await runDisposableLifecycle({ autoAddProjectItems: true, alreadyAppliedStatus: "Backlog" });
  const projectItemCreates = transport.calls.filter((args) =>
    args.includes("--method") && args.includes("POST") && args.some((value) => String(value).includes("/projectsV2/2/items")),
  );

  assert.equal(projectItemCreates.length, 0);
  assert.equal(transport.transitions.some(({ status }) => status === "Backlog"), false);
});

test("recovers an ambiguous status write from the authoritative readback once", async () => {
  const transport = await runDisposableLifecycle({ ambiguousStatusWrite: "Todo" });
  assert.deepEqual(transport.transitions.filter(({ status }) => status === "Todo"), ITEM_NODE_IDS.map((itemId) => ({
    itemId,
    status: "Todo",
  })));
  assert.equal(transport.calls.filter((args) => args.includes("PATCH") && args.some((value) => String(value).includes("/items/"))).length, ITEM_NODE_IDS.length * 3);
});

test("guards issue creation for existing, absent, ambiguous, and unresolved readbacks", async () => {
  for (const scenario of [
    { options: { existingIssueNumbers: [PARENT_NUMBER] }, expectedPosts: 0, outcome: "resolved" },
    { options: {}, expectedPosts: 1, outcome: "resolved" },
    { options: { ambiguousIssueCreate: PARENT_NUMBER }, expectedPosts: 1, outcome: "resolved" },
    { options: { unresolvedIssueCreate: PARENT_NUMBER }, expectedPosts: 1, outcome: "unresolved" },
  ]) {
    const transport = createRecordingTransport(scenario.options);
    const context = { ...scenario.options, transport, mcpCalls: [], restCalls: [], transportFailures: [] };
    if (scenario.outcome === "resolved") {
      const issue = await createIssueWithGuard(context, PARENT_NUMBER);
      assert.equal(issue.body.includes(issueMarker(PARENT_NUMBER)), true);
    } else {
      await assert.rejects(createIssueWithGuard(context, PARENT_NUMBER), /stopped after provider/);
    }
    const posts = transport.calls.filter((args) =>
      args.includes("--method") && args.includes("POST") && args.includes(`repos/${REPOSITORY}/issues`));
    assert.equal(posts.length, scenario.expectedPosts);
  }
});

test("runs every lifecycle boundary once through REST when MCP is rate limited", async () => {
  const transport = await runDisposableLifecycle({ mcpRateLimited: true });
  assert.deepEqual(transport.restCalls, transport.mcpCalls);
  assert.equal(new Set(transport.restCalls).size, transport.restCalls.length);
  assert.equal(transport.transportFailures.length, transport.mcpCalls.length);
  assert.equal(transport.transportFailures.every(({ failure }) => failure.category === "mcp_rate_limit"), true);
  for (const prefix of ["capture-", "hierarchy-", "membership-", "refinement-", "status-", "draft-handoff-", "completion-", "closure-"]) {
    assert.equal(transport.restCalls.some((operation) => operation.startsWith(prefix)), true, `${prefix} did not use REST fallback.`);
  }
  assert.equal(transport.calls.filter((args) => args.includes("POST") && args.includes(`repos/${REPOSITORY}/issues`)).length, ISSUE_NUMBERS.length);
  assert.equal(transport.calls.filter((args) => args.includes("POST") && args.some((value) => String(value).endsWith("/sub_issues"))).length, CHILD_NUMBERS.length);
  assert.equal(transport.calls.filter((args) => args.includes("POST") && args.some((value) => String(value).includes("/projectsV2/2/items"))).length, ISSUE_NUMBERS.length);
  assert.equal(transport.calls.filter((args) => args.includes("PUT") && args.some((value) => String(value).endsWith("/merge"))).length, 1);
  assert.equal(transport.calls.some((args) => args.some((value) => /graphql/i.test(String(value)))), false);
});

test("fails closed on missing, contradictory, and forbidden lifecycle evidence", async () => {
  await assert.rejects(
    runDisposableLifecycle({ missingProjectItem: CHILD_NUMBERS[0] }),
    (error) => error.message.includes("membership-665 stopped after provider") && error.cause?.message.includes("Project membership"),
  );
  await assert.rejects(
    runDisposableLifecycle({ contradictoryStatus: true }),
    (error) => error.message.includes("capture-status-read-660 stopped after provider") &&
      error.cause?.message.includes("non-contradictory Status field/value"),
  );
  const transport = createRecordingTransport();
  assert.throws(
    () => transport.commandRunner(["api", "graphql", "-f", "query=query { projectsV2 }"]),
    /Forbidden routine GraphQL request/,
  );
});
