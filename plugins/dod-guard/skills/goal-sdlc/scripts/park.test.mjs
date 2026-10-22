import assert from "node:assert/strict";
import test from "node:test";
import { renderParkedRecord } from "../../../lib/parked-record.mjs";
import { fakeGh } from "./harness/fake-gh-comments.mjs";
import { parkIssue } from "./park.mjs";

const PARK = {
  action: "park",
  repository: "TychoHenzen/dod-guard",
  issue: 981,
  blocked: "owner has not answered",
  unblocksWhen: "owner answers",
};
const UNPARK = { action: "unpark", repository: "TychoHenzen/dod-guard", issue: 981 };

const RECORD = {
  id: 77,
  body: renderParkedRecord({ blocked: "b", unblocksWhen: "u" }),
  author_association: "OWNER",
};

test("park posts one parked comment and the readback shows it", () => {
  const gh = fakeGh([{ id: 1, body: "plain remark" }]);
  const result = parkIssue(PARK, gh.run);
  assert.equal(result.ok, true);
  assert.equal(result.problem, null);
  assert.deepEqual(
    result.parked.map(({ blocked, unblocksWhen }) => ({ blocked, unblocksWhen })),
    [{ blocked: "owner has not answered", unblocksWhen: "owner answers" }],
  );
  const post = gh.calls.find((args) => args.includes("POST"));
  assert.deepEqual(post.slice(0, 4), ["api", "--method", "POST", "repos/TychoHenzen/dod-guard/issues/981/comments"]);
  assert.equal(post[5], `body=${renderParkedRecord({ blocked: PARK.blocked, unblocksWhen: PARK.unblocksWhen })}`);
});

test("park on an already parked issue writes nothing and still succeeds", () => {
  const gh = fakeGh([RECORD]);
  const result = parkIssue(PARK, gh.run);
  assert.equal(result.ok, true);
  assert.equal(result.problem, null);
  assert.equal(result.parked.length, 1);
  assert.equal(
    gh.calls.some((args) => args.includes("POST")),
    false,
  );
});

test("unpark deletes every parked comment and leaves other comments", () => {
  const gh = fakeGh([{ id: 1, body: "plain remark" }, RECORD, { ...RECORD, id: 78 }]);
  const result = parkIssue(UNPARK, gh.run);
  assert.equal(result.ok, true);
  assert.deepEqual(
    gh.comments.map(({ id }) => id),
    [1],
  );
  assert.deepEqual(
    gh.calls.filter((args) => args.includes("DELETE")).map((args) => args.at(-1)),
    ["repos/TychoHenzen/dod-guard/issues/comments/77", "repos/TychoHenzen/dod-guard/issues/comments/78"],
  );
});

test("unpark on an issue with no parked record writes nothing and still succeeds", () => {
  const gh = fakeGh([{ id: 1, body: "plain remark" }]);
  const result = parkIssue(UNPARK, gh.run);
  assert.equal(result.ok, true);
  assert.equal(result.problem, null);
  assert.deepEqual(result.parked, []);
  assert.equal(
    gh.calls.some((args) => args.includes("DELETE")),
    false,
  );
});

test("a write that does not show in the readback is not reported as success", () => {
  const parked = parkIssue(PARK, fakeGh([], { dropWrites: true }).run);
  assert.equal(parked.ok, false);
  assert.equal(parked.problem, "readback does not show issue #981 parked");
  const unparked = parkIssue(UNPARK, fakeGh([RECORD], { dropWrites: true }).run);
  assert.equal(unparked.ok, false);
  assert.equal(unparked.problem, "readback does not show issue #981 unparked");
});

test("a failing gh call is thrown to the caller", () => {
  const failing = () => ({ status: 1, stdout: "", stderr: "HTTP 403" });
  assert.throws(() => parkIssue(PARK, failing), /HTTP 403/u);
});
