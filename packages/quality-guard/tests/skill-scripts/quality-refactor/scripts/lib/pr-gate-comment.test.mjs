import assert from "node:assert/strict";
import test from "node:test";

import { upsertComment } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-comment.mjs";

const request = { repo: "owner/name", pr: "7", bodyFile: "comment.md" };

function fakeGh(listing) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args.includes("--paginate") ? listing : "";
  };
  return { gh, calls };
}

test("a pull request with no gate comment gets a new one", () => {
  const { gh, calls } = fakeGh("");
  upsertComment({ ...request, gh });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(0, 3), ["api", "--method", "POST"]);
  assert.equal(calls[1][3], "repos/owner/name/issues/7/comments");
  assert.ok(calls[1].includes("body=@comment.md"));
});

test("an existing gate comment is updated in place, not duplicated", () => {
  const { gh, calls } = fakeGh("4242\n");
  upsertComment({ ...request, gh });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(0, 3), ["api", "--method", "PATCH"]);
  assert.equal(calls[1][3], "repos/owner/name/issues/comments/4242");
});

test("the lookup matches only comments that start with the gate marker", () => {
  const { gh, calls } = fakeGh("");
  upsertComment({ ...request, gh });
  const filter = calls[0][calls[0].indexOf("--jq") + 1];
  assert.match(filter, /startswith\("<!-- quality-pr-gate -->"\)/);
});
