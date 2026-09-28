import assert from "node:assert/strict";
import test from "node:test";
import {
  FAILURE_CATEGORIES,
  REST_ENDPOINTS,
  TransportStopError,
  classifyTransportFailure,
  runTransport,
} from "../../../lib/transport-policy.mjs";

test("keeps MCP first when it succeeds", async () => {
  const calls = [];
  const request = { repository: "owner/repo", resource: { number: 7 }, fields: ["state"] };
  const result = await runTransport({
    operation: "issue",
    request,
    primary: async (value) => {
      calls.push(["mcp", value]);
      return { state: "open" };
    },
    rest: async () => {
      calls.push(["rest"]);
      return { state: "closed" };
    },
  });

  assert.equal(result.transport, "mcp");
  assert.deepEqual(result.value, { state: "open" });
  assert.deepEqual(calls, [["mcp", request]]);
});

test("routes one explicit MCP rate limit to the named REST endpoint", async () => {
  const evidence = [];
  const calls = [];
  const request = {
    repository: "owner/repo",
    project: { owner: "owner", number: 2, id: "PVTI_live" },
    resource: { itemId: "PVTI_item" },
    pagination: { after: "cursor-1", perPage: 100 },
    token: "do-not-record",
  };
  const result = await runTransport({
    operation: "projectItems",
    request,
    restEndpoint: "GET /users/owner/projectsV2/2/items",
    primary: async () => {
      calls.push("mcp");
      throw Object.assign(new Error("API rate limit exceeded token=secret"), {
        transport: "mcp",
        category: "rate_limit",
        status: 403,
      });
    },
    rest: async (value) => {
      calls.push(["rest", value]);
      assert.equal(value, request);
      return { items: [], pageInfo: { hasNextPage: false } };
    },
    evidence,
  });

  assert.equal(result.transport, "rest");
  assert.equal(result.endpoint, "GET /users/owner/projectsV2/2/items");
  assert.equal(result.primaryFailure.category, FAILURE_CATEGORIES.MCP_RATE_LIMIT);
  assert.deepEqual(calls, ["mcp", ["rest", request]]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].failure.category, FAILURE_CATEGORIES.MCP_RATE_LIMIT);
  assert.doesNotMatch(evidence[0].failure.message, /secret|do-not-record/);
  assert.equal(evidence[0].request.token, "[redacted]");
});

test("routes supported transport unavailability once and never retries MCP", async () => {
  let primaryCalls = 0;
  let restCalls = 0;
  const result = await runTransport({
    operation: "pullRequest",
    request: { repository: "owner/repo", pullNumber: 9 },
    primary: async () => {
      primaryCalls += 1;
      throw Object.assign(new Error("MCP connector unavailable"), {
        transport: "mcp",
        category: "transport_unavailable",
      });
    },
    rest: async () => {
      restCalls += 1;
      return { number: 9, state: "open" };
    },
  });

  assert.equal(result.transport, "rest");
  assert.equal(primaryCalls, 1);
  assert.equal(restCalls, 1);
  assert.equal(REST_ENDPOINTS.pullRequest, "GET /repos/{repository}/pulls/{pullNumber}");
});

test("stops without REST for unsupported and non-MCP failures", async () => {
  const failures = [
    { category: "authentication", status: 401 },
    { category: "permission", status: 403 },
    { category: "malformed" },
    { category: "timeout" },
    { category: "unsupported" },
    { category: "rest_rate_limit", transport: "rest", status: 429 },
    { category: "rate_limit", transport: "rest", status: 429 },
  ];

  for (const failure of failures) {
    let restCalls = 0;
    const expectedCategory = failure.transport === "rest" && failure.category === "rate_limit"
      ? FAILURE_CATEGORIES.REST_RATE_LIMIT
      : failure.category;
    await assert.rejects(
      runTransport({
        operation: "issue",
        request: { repository: "owner/repo", issueNumber: 7 },
        primary: async () => { throw Object.assign(new Error("stop"), failure); },
        rest: async () => { restCalls += 1; },
      }),
      (error) => error instanceof TransportStopError && error.details.category === expectedCategory,
    );
    assert.equal(restCalls, 0);
  }
});

test("stops when an MCP rate limit has no supported REST operation", async () => {
  let restCalls = 0;
  await assert.rejects(
    runTransport({
      operation: "reviewThreadMutation",
      request: { repository: "owner/repo", threadId: "thread-1" },
      primary: async () => { throw Object.assign(new Error("MCP rate limit"), { category: "mcp_rate_limit" }); },
      rest: async () => { restCalls += 1; },
      restEndpoint: null,
    }),
    (error) => error instanceof TransportStopError &&
      error.details.category === FAILURE_CATEGORIES.MCP_RATE_LIMIT &&
      error.details.endpoint === null,
  );
  assert.equal(restCalls, 0);
});

test("stops after one REST fallback failure and retains both redacted failures", async () => {
  const evidence = [];
  await assert.rejects(
    runTransport({
      operation: "issue",
      request: { repository: "owner/repo", issueNumber: 7 },
      primary: async () => { throw Object.assign(new Error("MCP rate limit"), { category: "mcp_rate_limit" }); },
      rest: async () => { throw Object.assign(new Error("REST permission denied"), { transport: "rest", status: 403 }); },
      evidence,
    }),
    (error) => error instanceof TransportStopError && error.details.restFailure.category === FAILURE_CATEGORIES.PERMISSION,
  );
  assert.equal(evidence.length, 2);
  assert.deepEqual(evidence.map(({ failure }) => failure.category), [
    FAILURE_CATEGORIES.MCP_RATE_LIMIT,
    FAILURE_CATEGORIES.PERMISSION,
  ]);
});

test("classifies a bare 403 as permission and an explicit MCP marker as rate limit", () => {
  assert.equal(classifyTransportFailure(Object.assign(new Error("forbidden"), { status: 403 }), "mcp").category, FAILURE_CATEGORIES.PERMISSION);
  assert.equal(classifyTransportFailure(Object.assign(new Error("API rate limit exceeded"), { status: 403 }), "mcp").category, FAILURE_CATEGORIES.MCP_RATE_LIMIT);
});
