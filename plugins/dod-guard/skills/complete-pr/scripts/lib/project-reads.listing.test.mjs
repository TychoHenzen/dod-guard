// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { okResponse } from "./github-client.test-support.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";

// A runner that answers the owned-Project listing from queued replies and records each call with the
// exit codes it accepted.
function listingRunner(replies) {
  const calls = [];
  const queue = [...replies];
  const runner = (args, acceptedExitCodes) => {
    calls.push({ args, acceptedExitCodes });
    return queue.shift();
  };
  return { calls, runner };
}

test("readIssueProjectStatuses lists the user-owned Projects first and checks an entry on a later page", () => {
  const { calls, runner } = listingRunner([
    okResponse(JSON.stringify([[{ number: 2, state: "closed" }], [{ number: 5 }]])),
  ]);

  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), {
    code: "github_response_shape",
    message: "GitHub response for users/owner/projectsV2 must include projects with an explicit state.",
  });
  assert.deepEqual(calls, [
    { args: ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"], acceptedExitCodes: [0, 1] },
  ]);
});

test("readIssueProjectStatuses falls back to orgs/<owner> after a users/ HTTP 404", () => {
  const { calls, runner } = listingRunner([
    { stderr: "gh: Not Found (HTTP 404)", status: 1, stdout: "" },
    okResponse(JSON.stringify([[{ number: 7, state: "closed" }]])),
  ]);

  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), {
    code: "github_response_shape",
    message: "GitHub response for orgs/owner/projectsV2 must include exactly one open linked Project.",
  });
  assert.deepEqual(calls, [
    { args: ["api", "--paginate", "--slurp", "users/owner/projectsV2?per_page=100"], acceptedExitCodes: [0, 1] },
    { args: ["api", "--paginate", "--slurp", "orgs/owner/projectsV2?per_page=100"], acceptedExitCodes: [0] },
  ]);
});

test("readIssueProjectStatuses throws the stderr text of any other listing failure and never reads orgs/", () => {
  const { calls, runner } = listingRunner([{ stderr: "gh: Server Error (HTTP 500)\n", status: 1, stdout: "" }]);
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, runner),
    (error) => {
      assert.equal(error.message, "gh: Server Error (HTTP 500)");
      return true;
    },
  );
  assert.equal(calls.length, 1);

  const { runner: silentRunner } = listingRunner([{ stderr: "", status: 1, stdout: "" }]);
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, silentRunner),
    (error) => {
      assert.equal(error.message, "Failed to list user-owned Projects.");
      return true;
    },
  );
});

test("readIssueProjectStatuses rejects a user-owned listing that is not an array of pages", () => {
  for (const stdout of [JSON.stringify({ message: "x" }), JSON.stringify([{ number: 2 }])]) {
    const { runner } = listingRunner([okResponse(stdout)]);
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, runner),
      (error) => {
        assert.equal(error.code, "github_response_shape");
        assert.equal(
          error.message,
          "GitHub response for users/owner/projectsV2?per_page=100 must include an array an array response.",
        );
        return true;
      },
    );
  }
});
