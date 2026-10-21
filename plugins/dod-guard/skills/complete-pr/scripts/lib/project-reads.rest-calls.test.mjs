// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { linkedProjectItem, projectItemIdentity } from "./fixtures/project-status-items.mjs";
import { createProjectStatusReader } from "./fixtures/project-status-reader.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";

test("reads linked Project statuses through REST without GraphQL", () => {
  const calls = [];
  const responses = new Map([
    ["users/owner/projectsV2?per_page=100", '[[{"number":2,"state":"open"}]]'],
    ["users/owner/projectsV2/2/items?per_page=100", JSON.stringify(projectItemIdentity(linkedProjectItem(1701)))],
    ["users/owner/projectsV2/2/fields?per_page=100", '[[{"id":407,"name":"Status","data_type":"single_select"}]]'],
    [
      "users/owner/projectsV2/2/items/1701?fields=407",
      JSON.stringify({
        id: 1701,
        node_id: "PVTI_item-1701",
        content: {
          number: 24,
          repository: { full_name: "owner/repo" },
          repository_url: "https://api.github.com/repos/owner/repo",
        },
        fields: [{ id: 407, name: "Status", value: { id: "done", name: { raw: "Done" } } }],
      }),
    ],
  ]);
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find(
      (value) => typeof value === "string" && (value.startsWith("users/") || value.startsWith("orgs/")),
    );
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  };

  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, runner), ["Done"]);
  const itemCall = calls.find((args) => args.includes("users/owner/projectsV2/2/items?per_page=100"));
  assert.deepEqual(itemCall.slice(0, 3), ["api", "--paginate", "--jq"]);
  for (const field of [
    ".id",
    ".node_id",
    ".content_type",
    ".content.number",
    ".content.repository.full_name",
    ".content.repository.fullName",
    ".content.repository_url",
  ]) {
    assert.match(itemCall[3], new RegExp(field.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(itemCall[3], /\.content\.(body|title|user)/);
  assert.equal(itemCall.at(-1), "users/owner/projectsV2/2/items?per_page=100");
  assert.deepEqual(
    calls.filter((args) => args !== itemCall),
    [
      ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"],
      ["api", "--paginate", "--slurp", "users/owner/projectsV2/2/fields?per_page=100"],
      ["api", "users/owner/projectsV2/2/items/1701?fields=407"],
    ],
  );
  assert.equal(
    calls.some((args) => args.includes("graphql") || args.includes("issue")),
    false,
  );
});

test("stops on a Project item rate-limit response", () => {
  const { read } = createProjectStatusReader({ rateLimitedProjects: new Set(["2"]) });

  assert.throws(() => read(24), /rate limit/i);
});
