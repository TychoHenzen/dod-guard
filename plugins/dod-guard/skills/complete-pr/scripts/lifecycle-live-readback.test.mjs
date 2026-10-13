import assert from "node:assert/strict";
import test from "node:test";
import { runGh } from "./lib/gh-runner.mjs";
import { verifyLiveLifecycleReadback } from "./lifecycle-live-readback.mjs";

// A runner whose target item carries the given Status value on every read.
function targetStatusRunner(value) {
  return (args) => {
    const endpoint = args.at(-1);
    if (endpoint.includes("/fields?")) {
      return { status: 0, stderr: "", stdout: JSON.stringify([[{ id: 407_767_889, name: "Status" }]]) };
    }
    if (endpoint.includes("/items?")) {
      const item = {
        id: 1,
        node_id: "PVTI_target",
        content: { number: 505, repository: { full_name: "owner/repo" } },
        fields: [{ name: "Status", value }],
      };
      return { status: 0, stderr: "", stdout: JSON.stringify(item) };
    }
    return { status: 0, stderr: "", stdout: JSON.stringify({ id: 505, number: 505, state: "closed" }) };
  };
}

function verifyTarget(commandRunner, expectedStatus) {
  return verifyLiveLifecycleReadback({
    repository: "owner/repo",
    issueNumber: 505,
    owner: "owner",
    projectNumber: 2,
    expectedStatus,
    commandRunner,
  });
}

test("reads a Status spelled as a bare string, or as {name}, as its name", () => {
  for (const value of ["Done", { name: "Done" }, { id: "opt", name: { raw: "Done", html: "Done" } }]) {
    assert.equal(verifyTarget(targetStatusRunner(value), "Done").projectItem.status, "Done");
  }
});

test("reads an item with no Status value as null", () => {
  for (const value of [undefined, null]) {
    assert.equal(verifyTarget(targetStatusRunner(value)).projectItem.status, null);
  }
});

test("stops on a Status whose spellings disagree, are blank, or name nothing, with the flattener's text", () => {
  const cases = [
    [{ name: { raw: "Done", html: "Todo" } }, "Status value names disagree."],
    [{ name: { raw: " ", html: " " } }, "Status value has a blank name."],
    [{ id: "opt-done" }, "Status value is not a name."],
  ];
  for (const [value, message] of cases) {
    assert.throws(() => verifyTarget(targetStatusRunner(value), "Done"), { message });
  }
});

test("passes the shared runner's text for a failed gh call through unchanged", () => {
  const silentFailure = () => ({ status: 1, stderr: "", stdout: "" });
  const commandRunner = (args) => runGh(args, [0], silentFailure);
  assert.throws(() => verifyTarget(commandRunner), { message: "gh exited with 1" });
});

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
