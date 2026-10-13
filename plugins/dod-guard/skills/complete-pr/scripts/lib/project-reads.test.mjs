// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CompletionError } from "./completion-error.mjs";
import {
  ProjectReadError,
  contentRepository,
  linkedProject,
  readIssueProjectStatuses,
  readSlurpedPages,
  sameRepository,
  statusValueName,
} from "./project-reads.mjs";

function okResponse(stdout) {
  return { stderr: "", status: 0, stdout };
}

// A runner that answers each endpoint from a table and throws for any endpoint it does not know, so a
// read the test does not expect fails it.
function tableRunner(table) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    const reply = table[args.at(-1)];
    if (reply === undefined) {
      throw new Error(`no reply for ${args.at(-1)}`);
    }
    if (!acceptedExitCodes.includes(reply.status)) {
      throw new Error(reply.stderr || `gh exited with ${reply.status}`);
    }
    return reply;
  };
  return { calls, runner };
}

const LISTING = "users/owner/projectsV2?per_page=100";
const membership = (number) => `users/owner/projectsV2/${number}/items?per_page=100`;
const repositoryItem = (repository) => ({ content: { repository: { full_name: repository } } });

function assertProjectReadError(read, endpoint, detail) {
  assert.throws(read, (error) => {
    assert.ok(error instanceof ProjectReadError, String(error));
    assert.equal(error.endpoint, endpoint);
    assert.equal(error.detail, detail);
    assert.equal(error.message, `${endpoint}: ${detail}`);
    return true;
  });
}

test("statusValueName reads one name from each REST spelling and gives null for an absent value", () => {
  assert.equal(statusValueName("Done"), "Done");
  assert.equal(statusValueName({ name: "Done" }), "Done");
  assert.equal(statusValueName({ name: { raw: "Done", html: "Done" } }), "Done");
  assert.equal(statusValueName(null), null);
  assert.equal(statusValueName(undefined), null);
});

test("statusValueName keeps its rejection messages", () => {
  assert.throws(() => statusValueName({ id: "x" }), { message: "Status value is not a name." });
  assert.throws(() => statusValueName({ name: { raw: " " } }), { message: "Status value has a blank name." });
  assert.throws(() => statusValueName({ name: { raw: "Done", html: "Todo" } }), { message: "Status value names disagree." });
});

const ISSUE_ITEM = { id: 1, node_id: "PVTI_1", content: { number: 24, repository: { full_name: "owner/repo" } } };
const STATUS_FIELDS = "users/owner/projectsV2/2/fields?per_page=100";
const ITEM_STATUS_READ = "users/owner/projectsV2/2/items/1?fields=7";

// A runner for one open Project holding issue 24, whose readback carries the given fields. statusFieldId
// is the Status field ID the fields listing reports.
function issueStatusRunner(fields, statusFieldId = 7) {
  return tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }]])),
    [membership(2)]: okResponse(JSON.stringify(ISSUE_ITEM)),
    [STATUS_FIELDS]: okResponse(JSON.stringify([[{ id: statusFieldId, name: "Status" }]])),
    [ITEM_STATUS_READ]: okResponse(JSON.stringify({ ...ISSUE_ITEM, fields })),
  }).runner;
}

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
    assert.throws(() => readIssueProjectStatuses("owner/repo", 24, issueStatusRunner(fields)), (error) => {
      assert.ok(error instanceof CompletionError);
      assert.equal(error.code, "github_response_shape");
      assert.equal(error.message, `GitHub response for ${ITEM_STATUS_READ} must include ${detail}.`);
      return true;
    });
  }
  const read = issueStatusRunner(status({ name: { raw: "Done" } }), "7");
  assert.deepEqual(readIssueProjectStatuses("owner/repo", 24, read), ["Done"]);
});

test("readIssueProjectStatuses stops on an item with no repository, where linkedProject passes over it", () => {
  const listing = okResponse(JSON.stringify([[{ number: 2, state: "open" }]]));
  const rows = [{ id: 1, node_id: "PVTI_1", content: { number: 24 } }, repositoryItem("owner/repo")];
  // The issue read takes newline-delimited --jq rows; linkedProject takes slurped pages of the same rows.
  const issueRead = tableRunner({
    [LISTING]: listing,
    [membership(2)]: okResponse(rows.map((row) => JSON.stringify(row)).join("\n")),
  });
  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, issueRead.runner), (error) => {
    assert.ok(error instanceof CompletionError, String(error));
    assert.equal(error.code, "github_response_shape");
    assert.equal(error.message, `GitHub response for ${membership(2)} must include Project items with repository identity.`);
    return true;
  });

  const repositoryRead = tableRunner({ [LISTING]: listing, [membership(2)]: okResponse(JSON.stringify([rows])) });
  assert.deepEqual(linkedProject(repositoryRead.runner, "owner", "owner/repo"), {
    basePath: "users/owner",
    project: { number: 2, state: "open" },
  });
});

test("linkedProject returns the one open Project holding an item of the repository", () => {
  const { calls, runner } = tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }, { number: 3, state: "closed" }, { number: 4, state: "Open" }]])),
    [membership(2)]: okResponse(JSON.stringify([[{ content: {} }, repositoryItem("other/repo")], [repositoryItem("Owner/Repo")]])),
    [membership(4)]: okResponse(JSON.stringify([[repositoryItem("other/repo")]])),
  });

  assert.deepEqual(linkedProject(runner, "owner", "owner/repo"), {
    basePath: "users/owner",
    project: { number: 2, state: "open" },
  });
  assert.deepEqual(calls, [
    ["api", "--paginate", "--slurp", LISTING],
    ["api", "--paginate", "--slurp", membership(2)],
    ["api", "--paginate", "--slurp", membership(4)],
  ]);
});

test("linkedProject names how many open Projects it found when that is not exactly one", () => {
  const listing = okResponse(JSON.stringify([[{ number: 2, state: "open" }, { number: 4, state: "open" }]]));
  const none = tableRunner({
    [LISTING]: listing,
    [membership(2)]: okResponse(JSON.stringify([[]])),
    [membership(4)]: okResponse(JSON.stringify([[repositoryItem("other/repo")]])),
  });
  assertProjectReadError(() => linkedProject(none.runner, "owner", "owner/repo"), "users/owner/projectsV2",
    "expected exactly one open linked Project, found none");

  const two = tableRunner({
    [LISTING]: listing,
    [membership(2)]: okResponse(JSON.stringify([[repositoryItem("owner/repo")]])),
    [membership(4)]: okResponse(JSON.stringify([[repositoryItem("owner/repo")]])),
  });
  assertProjectReadError(() => linkedProject(two.runner, "owner", "owner/repo"), "users/owner/projectsV2",
    "expected exactly one open linked Project, found 2 (#2, #4)");
});

test("linkedProject stops on a listed Project without a positive-integer number or a state", () => {
  for (const project of [{ number: "2", state: "open" }, { number: 0, state: "open" }, { number: 2 }]) {
    const { runner } = tableRunner({ [LISTING]: okResponse(JSON.stringify([[project]])) });
    assertProjectReadError(() => linkedProject(runner, "owner", "owner/repo"), "users/owner/projectsV2",
      "every Project must carry a number and a state");
  }
});

test("linkedProject restates a listing failure at the listing endpoint and keeps it as the cause", () => {
  const failure = new Error("gh: Server Error (HTTP 500)");
  const runner = () => {
    throw failure;
  };
  assert.throws(() => linkedProject(runner, "owner", "owner/repo"), (error) => {
    assert.ok(error instanceof ProjectReadError);
    assert.equal(error.message, "users/owner/projectsV2: gh: Server Error (HTTP 500)");
    assert.equal(error.cause, failure);
    return true;
  });
});

test("linkedProject lets a failure the runner throws for an item read pass through unchanged", () => {
  const failure = new Error("item read failed");
  const runner = (args) => {
    if (args.at(-1) === LISTING) {
      return okResponse(JSON.stringify([[{ number: 2, state: "open" }]]));
    }
    throw failure;
  };
  assert.throws(() => linkedProject(runner, "owner", "owner/repo"), (error) => error === failure);
});

test("readSlurpedPages flattens every page and names a page that is not an array", () => {
  const read = (pages) => tableRunner({ x: okResponse(pages) }).runner;
  assert.deepEqual(readSlurpedPages(read(JSON.stringify([[1], [2, 3]])), "x"), [1, 2, 3]);
  assertProjectReadError(() => readSlurpedPages(read("{"), "x"), "x", "did not return JSON");
  assertProjectReadError(() => readSlurpedPages(read(JSON.stringify([[1], {}])), "x"), "x",
    "missing page: every page must be an array");
});

test("contentRepository reads full_name first, then repository_url, and null for neither", () => {
  assert.equal(contentRepository({ repository: { full_name: "o/r" }, repository_url: "ignored" }, "x"), "o/r");
  assert.equal(contentRepository({ repository_url: "https://api.github.com/repos/o/r" }, "x"), "o/r");
  assert.equal(contentRepository({}, "x"), null);
  assert.equal(contentRepository(undefined, "x"), null);
  assertProjectReadError(() => contentRepository({ repository: { full_name: "o" } }, "x"), "x",
    "content repository full_name must name a repository");
  assertProjectReadError(() => contentRepository({ repository_url: "https://example.test/o/r" }, "x"), "x",
    "content repository_url must name a repository");
});

test("sameRepository compares names without case and never matches a missing name", () => {
  assert.equal(sameRepository("Owner/Repo", "owner/repo"), true);
  assert.equal(sameRepository("owner/other", "owner/repo"), false);
  assert.equal(sameRepository(null, "owner/repo"), false);
});

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
  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), (error) => {
    assert.equal(error.message, "gh: Server Error (HTTP 500)");
    return true;
  });
  assert.equal(calls.length, 1);

  const { runner: silentRunner } = listingRunner([{ stderr: "", status: 1, stdout: "" }]);
  assert.throws(() => readIssueProjectStatuses("owner/repo", 24, silentRunner), (error) => {
    assert.equal(error.message, "Failed to list user-owned Projects.");
    return true;
  });
});

test("readIssueProjectStatuses rejects a user-owned listing that is not an array of pages", () => {
  for (const stdout of [JSON.stringify({ message: "x" }), JSON.stringify([{ number: 2 }])]) {
    const { runner } = listingRunner([okResponse(stdout)]);
    assert.throws(() => readIssueProjectStatuses("owner/repo", 24, runner), (error) => {
      assert.equal(error.code, "github_response_shape");
      assert.equal(
        error.message,
        "GitHub response for users/owner/projectsV2?per_page=100 must include an array an array response.",
      );
      return true;
    });
  }
});
