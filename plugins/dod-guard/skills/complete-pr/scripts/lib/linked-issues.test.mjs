// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { readLinkedIssues } from "./linked-issues.mjs";

test("maps linked closing issues from paginated REST pull data without GraphQL", () => {
  const calls = [];
  const responses = new Map([
    ["repos/owner/repo/pulls/24", JSON.stringify({ body: "Closes #24" })],
    [
      "repos/owner/repo/pulls/24/commits?per_page=100",
      JSON.stringify([
        [
          {
            commit: { message: "Fixes other/repo#7" },
          },
        ],
      ]),
    ],
    [
      "repos/owner/repo/issues/24",
      JSON.stringify({ state: "closed", html_url: "https://github.com/owner/repo/issues/24" }),
    ],
    [
      "repos/other/repo/issues/7",
      JSON.stringify({ state: "closed", html_url: "https://github.com/other/repo/issues/7" }),
    ],
  ]);
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  };

  assert.deepEqual(readLinkedIssues("owner/repo", 24, runner), [
    { number: 24, state: "CLOSED", url: "https://github.com/owner/repo/issues/24" },
    { number: 7, state: "CLOSED", url: "https://github.com/other/repo/issues/7" },
  ]);
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo/pulls/24"],
    ["api", "--paginate", "--slurp", "repos/owner/repo/pulls/24/commits?per_page=100"],
    ["api", "repos/owner/repo/issues/24"],
    ["api", "repos/other/repo/issues/7"],
  ]);
  assert.equal(
    calls.some((args) => args.includes("graphql") || args.includes("pr")),
    false,
  );
});

test("reads each closing reference once across the body and the commit messages", () => {
  const calls = [];
  const responses = new Map([
    ["repos/owner/repo/pulls/24", JSON.stringify({ body: "Closes #24, fixes owner/repo#24" })],
    [
      "repos/owner/repo/pulls/24/commits?per_page=100",
      JSON.stringify([
        [{ commit: { message: "Resolves other/repo#7" } }, { commit: { message: "Closes other/repo#7" } }],
      ]),
    ],
    ["repos/owner/repo/issues/24", JSON.stringify({ state: "open", url: "https://api.github.com/repos/x/y/issues/1" })],
    ["repos/other/repo/issues/7", JSON.stringify({ state: "open", url: "https://api.github.com/repos/x/y/issues/1" })],
  ]);
  const runner = (args) => {
    calls.push(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    const stdout = responses.get(endpoint);
    if (!stdout) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { status: 0, stderr: "", stdout };
  };

  assert.deepEqual(readLinkedIssues("owner/repo", 24, runner), [
    { number: 24, state: "OPEN", url: "https://api.github.com/repos/x/y/issues/1" },
    { number: 7, state: "OPEN", url: "https://api.github.com/repos/x/y/issues/1" },
  ]);
  assert.equal(calls.filter((args) => args.includes("repos/owner/repo/issues/24")).length, 1);
  assert.equal(calls.filter((args) => args.includes("repos/other/repo/issues/7")).length, 1);
});
