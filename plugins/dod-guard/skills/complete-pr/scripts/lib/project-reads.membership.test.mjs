// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CompletionError } from "./completion-error.mjs";
import {
  ISSUE_ITEM,
  ITEM_STATUS_READ,
  issueStatusRunner,
  LISTING,
  membership,
  membershipRunner,
  PULL_REQUEST_ITEM,
  repositoryItem,
  tableRunner,
} from "./fixtures/project-reads-runners.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";

test("readIssueProjectStatuses maps each flattener rejection to its own github_response_shape stop", () => {
  const status = (value) => [{ id: 7, name: "Status", value }];
  const cases = [
    [status(undefined), "exactly one non-blank Status field/value"],
    [status({ id: "x" }), "exactly one non-blank Status field/value"],
    [status(""), "exactly one non-blank Status field/value"],
    [status({ name: { raw: "Done", html: "Todo" } }), "one non-contradictory Status field/value"],
    [[{ id: 8, name: "Status", value: "Done" }], "exactly one Status field/value"],
  ];
  for (const [fields, detail] of cases) {
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, issueStatusRunner(fields)),
      (error) => {
        assert.ok(error instanceof CompletionError);
        assert.equal(error.code, "github_response_shape");
        assert.equal(error.message, `GitHub response for ${ITEM_STATUS_READ} must include ${detail}.`);
        return true;
      },
    );
  }
  const read = issueStatusRunner(status({ name: { raw: "Done" } }), "7");
  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, read), ["Done"]);
});

test("readIssueProjectStatuses stops on an item with no repository, because it could be the issue's own", () => {
  const listing = okResponse(JSON.stringify([[{ number: 2, state: "open" }]]));
  const rows = [{ id: 1, node_id: "PVTI_1", content: { number: 24 } }, repositoryItem("owner/repo")];
  const issueRead = tableRunner({
    [LISTING]: listing,
    [membership(2)]: okResponse(rows.map((row) => JSON.stringify(row)).join("\n")),
  });
  assert.throws(
    () => readIssueProjectStatuses("owner/repo", 24, issueRead.runner),
    (error) => {
      assert.ok(error instanceof CompletionError, String(error));
      assert.equal(error.code, "github_response_shape");
      assert.equal(
        error.message,
        `GitHub response for ${membership(2)} must include Project items with repository identity.`,
      );
      return true;
    },
  );
});

test("readIssueProjectStatuses skips a PullRequest item that carries no repository identity", () => {
  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, membershipRunner([PULL_REQUEST_ITEM, ISSUE_ITEM])), [
    "Done",
  ]);
});

test("readIssueProjectStatuses still stops on an Issue, DraftIssue, or untyped item with no repository", () => {
  for (const contentType of ["Issue", "DraftIssue", undefined]) {
    const runner = membershipRunner([{ ...PULL_REQUEST_ITEM, content_type: contentType }, ISSUE_ITEM]);
    assert.throws(
      () => readIssueProjectStatuses("owner/repo", 24, runner),
      (error) => {
        assert.ok(error instanceof CompletionError, String(error));
        assert.equal(error.code, "github_response_shape");
        assert.match(error.message, /must include a non-blank repository identity/);
        return true;
      },
    );
  }
});
