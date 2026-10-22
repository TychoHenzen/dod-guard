import assert from "node:assert/strict";
import test from "node:test";
import { isRoutineGraphql } from "./fixtures/lifecycle-boundary.mjs";
import { CHILD_NUMBERS, ISSUE_NUMBERS, ITEM_NODE_IDS, REPOSITORY } from "./fixtures/lifecycle-constants.mjs";
import { runDisposableLifecycle } from "./fixtures/lifecycle-run.mjs";

const FALLBACK_PREFIXES = [
  "capture-",
  "hierarchy-",
  "membership-",
  "refinement-",
  "status-",
  "draft-handoff-",
  "completion-",
  "closure-",
];

function countCalls(calls, method, matchesArg) {
  return calls.filter((args) => args.includes(method) && args.some(matchesArg)).length;
}

test("proves the disposable PBI lifecycle with recording REST readbacks", async () => {
  const transport = await runDisposableLifecycle();
  assert.deepEqual(
    transport.transitions.map(({ status }) => status),
    [
      ...Array(ITEM_NODE_IDS.length).fill("Todo"),
      ...Array(ITEM_NODE_IDS.length).fill("In Progress"),
      ...Array(ITEM_NODE_IDS.length).fill("Done"),
    ],
  );
  assert.deepEqual(
    transport.transitions.slice(0, ITEM_NODE_IDS.length).map(({ itemId }) => itemId),
    ITEM_NODE_IDS,
  );
});

test("reuses automatically-created Project items and skips an already-applied status", async () => {
  const transport = await runDisposableLifecycle({ autoAddProjectItems: true, alreadyAppliedStatus: "Backlog" });
  const projectItemCreates = transport.calls.filter(
    (args) =>
      args.includes("--method") &&
      args.includes("POST") &&
      args.some((value) => String(value).includes("/projectsV2/2/items")),
  );

  assert.equal(projectItemCreates.length, 0);
  assert.equal(
    transport.transitions.some(({ status }) => status === "Backlog"),
    false,
  );
});

test("recovers an ambiguous status write from the authoritative readback once", async () => {
  const transport = await runDisposableLifecycle({ ambiguousStatusWrite: "Todo" });
  assert.deepEqual(
    transport.transitions.filter(({ status }) => status === "Todo"),
    ITEM_NODE_IDS.map((itemId) => ({
      itemId,
      status: "Todo",
    })),
  );
  assert.equal(
    transport.calls.filter((args) => args.includes("PATCH") && args.some((value) => String(value).includes("/items/")))
      .length,
    ITEM_NODE_IDS.length * 3,
  );
});

test("runs every lifecycle boundary once through REST when MCP is rate limited", async () => {
  const transport = await runDisposableLifecycle({ mcpRateLimited: true });
  assert.deepEqual(transport.restCalls, transport.mcpCalls);
  assert.equal(new Set(transport.restCalls).size, transport.restCalls.length);
  assert.equal(transport.transportFailures.length, transport.mcpCalls.length);
  assert.equal(
    transport.transportFailures.every(({ failure }) => failure.category === "mcp_rate_limit"),
    true,
  );
  for (const prefix of FALLBACK_PREFIXES) {
    assert.equal(
      transport.restCalls.some((operation) => operation.startsWith(prefix)),
      true,
      `${prefix} did not use REST fallback.`,
    );
  }
  assert.equal(
    countCalls(transport.calls, "POST", (value) => value === `repos/${REPOSITORY}/issues`),
    ISSUE_NUMBERS.length,
  );
  assert.equal(
    countCalls(transport.calls, "POST", (value) => String(value).endsWith("/sub_issues")),
    CHILD_NUMBERS.length,
  );
  assert.equal(
    countCalls(transport.calls, "POST", (value) => String(value).includes("/projectsV2/2/items")),
    ISSUE_NUMBERS.length,
  );
  assert.equal(
    countCalls(transport.calls, "PUT", (value) => String(value).endsWith("/merge")),
    1,
  );
  assert.equal(transport.calls.some(isRoutineGraphql), false);
  assert.equal(
    transport.calls.some((args) => args[0] === "pr"),
    false,
  );
});
