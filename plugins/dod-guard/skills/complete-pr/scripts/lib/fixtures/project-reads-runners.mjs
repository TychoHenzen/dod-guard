import assert from "node:assert/strict";
import { CompletionError } from "../completion-error.mjs";
import { okResponse } from "../github-client.test-support.mjs";
import { ProjectReadError } from "../project-reads.mjs";

// A runner that answers each endpoint from a table and throws for any
// endpoint it does not know, so a read the test does not expect fails it.
export function tableRunner(table) {
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

export const LISTING = "users/owner/projectsV2?per_page=100";

export const membership = (number) =>
  `users/owner/projectsV2/${number}/items?per_page=100`;

export const repositoryItem = (repository) => ({
  content: { repository: { full_name: repository } },
});

export function assertProjectReadError(read, endpoint, detail) {
  assert.throws(read, (error) => {
    assert.ok(error instanceof ProjectReadError, String(error));
    assert.equal(error.endpoint, endpoint);
    assert.equal(error.detail, detail);
    assert.equal(error.message, `${endpoint}: ${detail}`);
    return true;
  });
}

export const ISSUE_ITEM = {
  id: 1,
  node_id: "PVTI_1",
  content: { number: 24, repository: { full_name: "owner/repo" } },
};
export const STATUS_FIELDS = "users/owner/projectsV2/2/fields?per_page=100";
export const ITEM_STATUS_READ = "users/owner/projectsV2/2/items/1?fields=7";

// A runner for one open Project holding issue 24, whose readback carries the
// given fields. statusFieldId is the Status field ID the fields listing
// reports.
export function issueStatusRunner(fields, statusFieldId = 7) {
  return tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }]])),
    [membership(2)]: okResponse(JSON.stringify(ISSUE_ITEM)),
    [STATUS_FIELDS]: okResponse(
      JSON.stringify([[{ id: statusFieldId, name: "Status" }]]),
    ),
    [ITEM_STATUS_READ]: okResponse(JSON.stringify({ ...ISSUE_ITEM, fields })),
  }).runner;
}

// Project 2 item 273009693 (PullRequest #946) as PROJECT_ITEM_IDENTITY_JQ
// projects it. The REST content has no repository key, so every identity
// field is null.
export const PULL_REQUEST_ITEM = {
  id: 273_009_693,
  node_id: "PVTI_lAHOAFboXs4BiVn2zhBFzB0",
  content_type: "PullRequest",
  content: {
    number: 946,
    repository: { full_name: null, fullName: null },
    repository_url: null,
  },
};

export const DONE_FIELD = {
  id: 7,
  name: "Status",
  value: { name: { raw: "Done" } },
};

export function membershipRunner(rows) {
  const itemRead = JSON.stringify({ ...ISSUE_ITEM, fields: [DONE_FIELD] });
  return tableRunner({
    [LISTING]: okResponse(JSON.stringify([[{ number: 2, state: "open" }]])),
    [membership(2)]: okResponse(
      rows.map((row) => JSON.stringify(row)).join("\n"),
    ),
    [STATUS_FIELDS]: okResponse(JSON.stringify([[{ id: 7, name: "Status" }]])),
    [ITEM_STATUS_READ]: okResponse(itemRead),
  }).runner;
}

export const PROJECT_ITEM_ENDPOINT =
  "users/owner/projectsV2/2/items/1701?fields=407";
export const PROJECTS_ENDPOINT = "users/owner/projectsV2";

// The exact stop a Project read raises: a github_response_shape
// CompletionError naming its endpoint.
export function assertProjectShapeStop(read, endpoint, detail) {
  assert.throws(read, (error) => {
    assert.ok(error instanceof CompletionError, String(error));
    assert.equal(error.code, "github_response_shape");
    assert.equal(
      error.message,
      `GitHub response for ${endpoint} must include ${detail}.`,
    );
    return true;
  });
}
