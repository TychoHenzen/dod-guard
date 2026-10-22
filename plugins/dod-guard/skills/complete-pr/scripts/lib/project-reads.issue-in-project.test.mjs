// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { it } from "node:test";
import {
  DONE_FIELD,
  ISSUE_ITEM,
  ITEM_STATUS_READ,
  LISTING,
  membership,
  repositoryItem,
  STATUS_FIELDS,
  tableRunner,
} from "./fixtures/project-reads-runners.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import { readIssueStatusInProject } from "./project-reads.mjs";

const PROJECT = { basePath: "users/owner", number: 2 };
const REPOSITORY = "owner/repo";
const READ_ENDPOINT_COUNT = 3;
const OTHER_ITEM = { ...ISSUE_ITEM, content: { ...repositoryItem(REPOSITORY).content, number: 25 } };

it("reads the Status inside the given Project without listing Projects", () => {
  const { calls, runner } = tableRunner({
    [membership(2)]: okResponse(JSON.stringify(ISSUE_ITEM)),
    [STATUS_FIELDS]: okResponse(JSON.stringify([[{ id: 7, name: "Status" }]])),
    [ITEM_STATUS_READ]: okResponse(JSON.stringify({ ...ISSUE_ITEM, fields: [DONE_FIELD] })),
  });

  assert.equal(readIssueStatusInProject(PROJECT, REPOSITORY, 24, runner), "Done");
  assert.equal(calls.length, READ_ENDPOINT_COUNT);
  assert.ok(!calls.some((args) => args.at(-1) === LISTING), "the Project list was read");
});

it("returns null when the Project holds no item for the issue", () => {
  const { calls, runner } = tableRunner({
    [membership(2)]: okResponse(JSON.stringify(OTHER_ITEM)),
  });

  assert.equal(readIssueStatusInProject(PROJECT, REPOSITORY, 24, runner), null);
  assert.equal(calls.length, 1);
});

it("stops when the Project holds two items for the issue", () => {
  const secondItem = { ...ISSUE_ITEM, id: 2 };
  secondItem.node_id = "PVTI_2";
  const { runner } = tableRunner({
    [membership(2)]: okResponse([JSON.stringify(ISSUE_ITEM), JSON.stringify(secondItem)].join("\n")),
  });

  assert.throws(
    () => readIssueStatusInProject(PROJECT, REPOSITORY, 24, runner),
    (error) => {
      assert.equal(error.code, "github_response_shape");
      assert.equal(
        error.message,
        `GitHub response for ${membership(2)} must include unique repository issue membership; exactly one matching issue item.`,
      );
      return true;
    },
  );
});
