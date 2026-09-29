import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "./lib/github-client.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
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

function ensureProjectMembership(transport, issue) {
  const existing = readProjectMembership(transport).some(({ content }) => content.number === issue.number);
  if (existing) return;
  runRest(transport, [
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

function assertIssueReadbacks(transport, expectedLabels, expectedState = "open") {
  for (const number of ISSUE_NUMBERS) {
    const issue = runRest(transport, ["api", `repos/${REPOSITORY}/issues/${number}`]);
    assert.equal(issue.repository.full_name, REPOSITORY);
    assert.deepEqual(issue.labels.map(({ name }) => name), expectedLabels.get(number));
    assert.equal(issue.state, expectedState);
  }
}

function assertStatuses(client, expectedStatus) {
  for (const number of ISSUE_NUMBERS) {
    assert.deepEqual(client.getIssueProjectStatuses(number), [expectedStatus]);
  }
}

function writeStatus(transport, client, expectedStatus) {
  const option = STATUS_OPTIONS.find((candidate) => candidate.name === expectedStatus);
  const result = writeProjectStatuses({
    owner: OWNER,
    projectNumber: PROJECT_NUMBER,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: option.id,
    expectedStatus,
    itemIds: ITEM_NODE_IDS,
    commandRunner: transport.commandRunner,
  });
  assert.deepEqual(result, {
    projectId: PROJECT_NODE_ID,
    mutations: ITEM_NODE_IDS.map((itemId) => ({ itemId, status: expectedStatus })),
  });
  assertStatuses(client, expectedStatus);
}

function runDisposableLifecycle(options = {}) {
  const transport = createRecordingTransport(options);
  const client = new GitHubClient(REPOSITORY, PULL_NUMBER, transport.commandRunner);

  assert.deepEqual(client.getRepository(), {
    autoMergeAllowed: true,
    canPush: true,
    defaultBranch: "master",
    nameWithOwner: REPOSITORY,
  });
  const createdIssues = ISSUE_NUMBERS.map(() => runRest(transport, ["api", "--method", "POST", `repos/${REPOSITORY}/issues`]));
  assert.deepEqual(createdIssues.map(({ number }) => number), ISSUE_NUMBERS);

  for (const childNumber of CHILD_NUMBERS) {
    const child = createdIssues.find(({ number }) => number === childNumber);
    runRest(transport, [
      "api",
      "--method",
      "POST",
      `repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`,
      "-F",
      `sub_issue_id=${child.id}`,
    ]);
  }
  const hierarchy = runRest(transport, ["api", `repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`]);
  assert.deepEqual(hierarchy.map(({ number }) => number), CHILD_NUMBERS);

  for (const issue of createdIssues) {
    ensureProjectMembership(transport, issue);
  }
  const projectMembership = readProjectMembership(transport).map(({ content }) => content.number).sort((a, b) => a - b);
  assert.equal(projectMembership.length, ISSUE_NUMBERS.length, "Project membership readback was incomplete.");
  assert.deepEqual(projectMembership, ISSUE_NUMBERS.slice().sort((a, b) => a - b));
  assertIssueReadbacks(transport, new Map(ISSUE_NUMBERS.map((number) => [number, []])));
  assertStatuses(client, "Backlog");
  if (options.alreadyAppliedStatus) writeStatus(transport, client, options.alreadyAppliedStatus);

  for (const number of ISSUE_NUMBERS) {
    runRest(transport, [
      "api",
      "--method",
      "PATCH",
      `repos/${REPOSITORY}/issues/${number}`,
      ...ISSUE_LABELS.get(number).flatMap((label) => ["-f", `labels[]=${label}`]),
    ]);
  }
  assertIssueReadbacks(transport, ISSUE_LABELS);
  writeStatus(transport, client, "Todo");
  writeStatus(transport, client, "In Progress");

  const pullRequest = client.getPullRequest();
  assert.equal(pullRequest.state, "OPEN");
  assert.equal(pullRequest.isDraft, false);
  assert.equal(pullRequest.headSha, HEAD_SHA);
  assert.equal(pullRequest.mergeable, "MERGEABLE");
  assert.deepEqual(client.getRequiredChecks(PULL_NUMBER, pullRequest), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
  ]);
  assert.deepEqual(runRest(transport, ["api", `repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`]).map(({ state }) => state), ["APPROVED"]);
  assert.deepEqual(
    client.getLinkedIssues(PULL_NUMBER).map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "OPEN" })),
  );

  assert.deepEqual(client.mergePullRequest(PULL_NUMBER, HEAD_SHA), { merged: true, sha: "merge-1" });
  for (const number of ISSUE_NUMBERS) {
    runRest(transport, ["api", "--method", "PATCH", `repos/${REPOSITORY}/issues/${number}`, "-f", "state=closed"]);
  }
  writeStatus(transport, client, "Done");
  assert.deepEqual(client.getPullRequest().state, "MERGED");
  assert.deepEqual(
    client.getLinkedIssues(PULL_NUMBER).map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "CLOSED" })),
  );
  assertIssueReadbacks(transport, ISSUE_LABELS, "closed");
  assert.equal(transport.calls.some((args) => args.some((value) => /graphql/i.test(String(value)))), false);
  return transport;
}

test("proves the disposable PBI lifecycle with recording REST readbacks", () => {
  const transport = runDisposableLifecycle();
  assert.deepEqual(transport.transitions.map(({ status }) => status), [
    ...Array(ITEM_NODE_IDS.length).fill("Todo"),
    ...Array(ITEM_NODE_IDS.length).fill("In Progress"),
    ...Array(ITEM_NODE_IDS.length).fill("Done"),
  ]);
  assert.deepEqual(transport.transitions.slice(0, ITEM_NODE_IDS.length).map(({ itemId }) => itemId), ITEM_NODE_IDS);
});

test("reuses automatically-created Project items and skips an already-applied status", () => {
  const transport = runDisposableLifecycle({ autoAddProjectItems: true, alreadyAppliedStatus: "Backlog" });
  const projectItemCreates = transport.calls.filter((args) =>
    args.includes("--method") && args.includes("POST") && args.some((value) => String(value).includes("/projectsV2/2/items")),
  );

  assert.equal(projectItemCreates.length, 0);
  assert.equal(transport.transitions.some(({ status }) => status === "Backlog"), false);
});

test("recovers an ambiguous status write from the authoritative readback once", () => {
  const transport = runDisposableLifecycle({ ambiguousStatusWrite: "Todo" });
  assert.deepEqual(transport.transitions.filter(({ status }) => status === "Todo"), ITEM_NODE_IDS.map((itemId) => ({
    itemId,
    status: "Todo",
  })));
  assert.equal(transport.calls.filter((args) => args.includes("PATCH") && args.some((value) => String(value).includes("/items/"))).length, ITEM_NODE_IDS.length * 3);
});

test("fails closed on missing, contradictory, and forbidden lifecycle evidence", () => {
  assert.throws(
    () => runDisposableLifecycle({ missingProjectItem: CHILD_NUMBERS[0] }),
    /Project membership readback/,
  );
  assert.throws(
    () => runDisposableLifecycle({ contradictoryStatus: true }),
    /non-contradictory Status field\/value/,
  );
  const transport = createRecordingTransport();
  assert.throws(
    () => transport.commandRunner(["api", "graphql", "-f", "query=query { projectsV2 }"]),
    /Forbidden routine GraphQL request/,
  );
});
