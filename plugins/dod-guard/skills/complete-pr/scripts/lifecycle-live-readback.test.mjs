import assert from "node:assert/strict";
import test from "node:test";
import { verifyLiveLifecycleReadback } from "./lifecycle-live-readback.mjs";

test("verifies issue and Project state with five read-only REST requests", () => {
  const calls = [];
  const issue = { id: 505, number: 505, state: "open" };
  const items = [[
    {
      id: 251_837_746,
      node_id: "PVTI_target",
      content: { number: 505, repository: { full_name: "owner/repo" } },
      fields: [{ name: "Status", value: { name: { raw: "Backlog" } } }],
    },
    {
      id: 251_837_747,
      node_id: "PVTI_unrelated",
      content: { number: 999, repository: { full_name: "owner/repo" } },
      fields: [{ name: "Status", value: { name: { raw: "Todo" } } }],
    },
  ]];
  const commandRunner = (args) => {
    calls.push(args);
    const endpoint = args.at(-1);
    if (endpoint.includes("/fields?")) {
      return { status: 0, stderr: "", stdout: JSON.stringify([[{ id: 407_767_889, name: "Status" }]]) };
    }
    if (endpoint.includes("/items?")) {
      return { status: 0, stderr: "", stdout: items.flat().map((item) => JSON.stringify(item)).join("\n") };
    }
    return { status: 0, stderr: "", stdout: JSON.stringify(issue) };
  };

  const result = verifyLiveLifecycleReadback({
    repository: "owner/repo",
    issueNumber: 505,
    owner: "owner",
    projectNumber: 2,
    expectedIssueState: "open",
    expectedStatus: "Backlog",
    commandRunner,
  });

  assert.deepEqual(result, {
    issue,
    projectItem: { id: 251_837_746, nodeId: "PVTI_target", issueNumber: 505, repository: "owner/repo", status: "Backlog" },
    unrelatedItemsUnchanged: true,
    requests: 5,
  });
  assert.equal(calls.length, 5);
  assert.equal(calls.every((args) => args[0] === "api" && !args.includes("--method") && !args.includes("graphql")), true);
});

test("fails when an unrelated Project item changes between snapshots", () => {
  let itemRead = 0;
  const commandRunner = (args) => {
    const endpoint = args.at(-1);
    if (!endpoint.includes("projectsV2")) {
      return { status: 0, stderr: "", stdout: JSON.stringify({ id: 505, number: 505, state: "open" }) };
    }
    if (endpoint.includes("/fields?")) {
      return { status: 0, stderr: "", stdout: JSON.stringify([[{ id: 407_767_889, name: "Status" }]]) };
    }
    itemRead += 1;
    const status = itemRead === 1 ? "Todo" : "Done";
    return {
      status: 0,
      stderr: "",
      stdout: [
        { id: 1, node_id: "target", content: { number: 505, repository: { full_name: "owner/repo" } }, fields: [] },
        { id: 2, node_id: "other", content: { number: 9, repository: { full_name: "owner/repo" } }, fields: [{ name: "Status", value: { name: status } }] },
      ].map((item) => JSON.stringify(item)).join("\n"),
    };
  };

  assert.throws(
    () => verifyLiveLifecycleReadback({ repository: "owner/repo", issueNumber: 505, owner: "owner", projectNumber: 2, commandRunner }),
    /unrelated Project item changed/,
  );
});
