import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderParkedRecord } from "../../../lib/parked-record.mjs";
import { parkIssue, usageProblem } from "./park.mjs";

const PARK = {
  action: "park",
  repository: "TychoHenzen/dod-guard",
  issue: 981,
  blocked: "owner has not answered",
  unblocksWhen: "owner answers",
};
const UNPARK = { action: "unpark", repository: "TychoHenzen/dod-guard", issue: 981 };

// A fake gh holding one issue's comments. Each call is recorded so a case can assert the exact write.
function fakeGh(initial = [], { dropWrites = false } = {}) {
  const comments = [...initial];
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === "api" && args.includes("--paginate")) {
      return { status: 0, stdout: JSON.stringify([comments]), stderr: "" };
    }
    if (args.includes("POST") && !dropWrites) {
      comments.push({ id: 500 + comments.length, body: args[args.indexOf("-f") + 1].replace(/^body=/u, "") });
    }
    if (args.includes("DELETE") && !dropWrites) {
      const id = Number(args.at(-1).split("/").at(-1));
      comments.splice(
        comments.findIndex((comment) => comment.id === id),
        1,
      );
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls, comments };
}

const RECORD = { id: 77, body: renderParkedRecord({ blocked: "b", unblocksWhen: "u" }) };

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

test("usageProblem names the first missing or malformed flag", () => {
  const flags = { action: "park", repository: "a/b", issue: "5", blocked: "x", "unblocks-when": "y" };
  assert.equal(usageProblem(flags), null);
  assert.equal(usageProblem(null), "arguments must be flags only");
  assert.equal(usageProblem({ ...flags, action: "hold" }), "--action must be park or unpark");
  assert.equal(usageProblem({ ...flags, repository: "ab" }), "--repository must be owner/name");
  assert.equal(usageProblem({ ...flags, issue: "0" }), "--issue must be a positive issue number");
  assert.equal(usageProblem({ ...flags, blocked: "two\nlines" }), "--blocked must be one nonblank line");
  assert.equal(usageProblem({ ...flags, "unblocks-when": undefined }), "--unblocks-when must be one nonblank line");
  assert.equal(usageProblem({ action: "unpark", repository: "a/b", issue: "5" }), null);
});

test("the command exits 2 with usage on bad arguments and never calls gh", () => {
  const script = fileURLToPath(new URL("./park.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--action=park", "--repository=a/b"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--issue must be a positive issue number/u);
  assert.match(result.stderr, /usage: park\.mjs/u);
});
