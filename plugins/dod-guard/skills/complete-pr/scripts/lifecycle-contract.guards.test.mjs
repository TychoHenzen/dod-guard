import assert from "node:assert/strict";
import test from "node:test";
import { linkedProjectReadArgs } from "../../../lib/linked-project-read.mjs";
import { createIssueWithGuard, runRest } from "./fixtures/lifecycle-boundary.mjs";
import {
  CHILD_NUMBERS,
  issueMarker,
  OWNER,
  PARENT_NUMBER,
  PROJECT_NUMBER,
  REPOSITORY,
} from "./fixtures/lifecycle-constants.mjs";
import { runDisposableLifecycle } from "./fixtures/lifecycle-run.mjs";
import { createRecordingTransport } from "./lifecycle-fixture.mjs";

const FORBIDDEN_GRAPHQL = /Forbidden routine GraphQL request/;
const ADD_ITEM_VALIDATION_FAILURE = /Validation Failed \(HTTP 422\)/;
const DUPLICATE_ADD_ITEM = /Content already exists in this project \(HTTP 422\)/;

const OUTCOMES = {
  resolved: async (context) => {
    const issue = await createIssueWithGuard(context, PARENT_NUMBER);
    assert.equal(issue.body.includes(issueMarker(PARENT_NUMBER)), true);
  },
  unresolved: (context) => assert.rejects(createIssueWithGuard(context, PARENT_NUMBER), /stopped after provider/),
};

test("rejects the content_id and content_type add-item shape the live API refused", () => {
  const existing = { existingIssueNumbers: [PARENT_NUMBER] };
  const transport = createRecordingTransport(existing);
  const issuePath = `repos/${REPOSITORY}/issues/${PARENT_NUMBER}`;
  const issueId = runRest(transport, ["api", issuePath]).id;
  const addItem = (...fields) =>
    transport.commandRunner([
      "api",
      "--method",
      "POST",
      `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
      ...fields,
    ]);

  for (const fields of [
    ["-F", `content_id=${issueId}`, "-f", "content_type=Issue"],
    ["-f", "type=Issue", "-F", `id=${issueId}`, "-f", "content_type=Issue"],
  ]) {
    const rejected = addItem(...fields);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, ADD_ITEM_VALIDATION_FAILURE);
  }
  assert.equal(transport.projectItems.size, 0);

  assert.equal(addItem("-f", "type=Issue", "-F", `id=${issueId}`).status, 0);
  assert.equal(transport.projectItems.size, 1);
  // A repeated add answers 422 Content already exists, which the standard reads
  // back as success.
  const repeated = addItem("-f", "type=Issue", "-F", `id=${issueId}`);
  assert.match(repeated.stderr, DUPLICATE_ADD_ITEM);
  assert.equal(transport.projectItems.size, 1);
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
    await OUTCOMES[scenario.outcome](context);
    const posts = transport.calls.filter(
      (args) => args.includes("--method") && args.includes("POST") && args.includes(`repos/${REPOSITORY}/issues`),
    );
    assert.equal(posts.length, scenario.expectedPosts);
  }
});

test("fails closed on missing, contradictory, and forbidden lifecycle evidence", async () => {
  await assert.rejects(
    runDisposableLifecycle({ missingProjectItem: CHILD_NUMBERS[0] }),
    (error) =>
      error.message.includes("membership-665 stopped after provider") &&
      error.cause?.message.includes("Project membership"),
  );
  await assert.rejects(
    runDisposableLifecycle({ contradictoryStatus: true }),
    (error) =>
      error.message.includes("capture-status-read-660 stopped after provider") &&
      error.cause?.message.includes("non-contradictory Status field/value"),
  );
  const transport = createRecordingTransport();
  assert.throws(
    () => transport.commandRunner(["api", "graphql", "-f", "query=query { projectsV2 }"]),
    FORBIDDEN_GRAPHQL,
  );
  const documented = linkedProjectReadArgs(REPOSITORY);
  const mutation = documented.with(3, "query=mutation { x }");
  const runMutation = () => transport.commandRunner(mutation);
  assert.throws(runMutation, FORBIDDEN_GRAPHQL);
  const linked = runRest(transport, documented);
  const { nodes } = linked.data.repository.projectsV2;
  assert.deepEqual(
    nodes.map(({ number, closed }) => ({ number, closed })),
    [{ number: PROJECT_NUMBER, closed: false }],
  );
});
