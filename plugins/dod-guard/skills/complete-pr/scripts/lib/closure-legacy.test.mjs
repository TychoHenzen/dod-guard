// Tests for record-legacy: the one write, the rerun, the bad numbers, and the command's option guard.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS } from "./closure-commands.mjs";
import { HEAD, ISSUE, MERGE, PULL, REPO } from "./closure-legacy.fake-gh.mjs";
import { recordLegacyDelivery } from "./closure-legacy.mjs";
import { fixture, legacyOf } from "./closure-legacy.test-support.mjs";
import { parseCompletionRecord } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";

const SHA_LENGTH = 40;
const MOVED_HEAD = "c".repeat(SHA_LENGTH);
const MOVED_MERGE = "d".repeat(SHA_LENGTH);
const NOT_TARGET_REPOSITORY = () => {
  throw new Error("no read was expected");
};

test("record-legacy posts one legacy completion record", () => {
  const fx = fixture();
  assert.deepEqual(legacyOf(fx), { records: [{ issue: 61, action: "posted" }], legacy: true });
  assert.deepEqual(fx.state.writes, [{ method: "POST", endpoint: `repos/${REPO}/issues/61/comments` }]);
  assert.deepEqual(parseCompletionRecord(fx.state.comments).record, {
    commentId: 100,
    pullRequest: 62,
    mergeCommit: MERGE,
    trustedHeadSha: HEAD,
    requiredChecks: "pass",
    pendingRows: [],
    legacy: true,
  });
});

test("record-legacy rerun leaves the record unchanged and updates it in place when the head moves", () => {
  const fx = fixture();
  legacyOf(fx);
  assert.deepEqual(legacyOf(fx), { records: [{ issue: 61, action: "unchanged" }], legacy: true });
  assert.equal(fx.state.writes.length, 1);
  fx.state.pull.head.sha = MOVED_HEAD;
  fx.state.pull.merge_commit_sha = MOVED_MERGE;
  assert.deepEqual(legacyOf(fx), { records: [{ issue: 61, action: "updated" }], legacy: true });
  assert.equal(fx.state.writes.at(-1).method, "PATCH");
  assert.equal(fx.state.comments.length, 1);
  const { record } = parseCompletionRecord(fx.state.comments);
  assert.equal(record.trustedHeadSha, MOVED_HEAD);
  assert.equal(record.mergeCommit, MOVED_MERGE);
});

test("record-legacy stops on bad numbers before any read", () => {
  const fx = fixture();
  const message = "record-legacy needs positive integer --pull and --issue";
  assert.throws(
    () => recordLegacyDelivery({ repository: REPO, pull: 0, issue: ISSUE, runner: fx.runner }),
    (error) => error instanceof ClosureStop && error.message === message,
  );
  assert.throws(
    () => recordLegacyDelivery({ repository: REPO, pull: PULL, issue: "x", runner: fx.runner }),
    (error) => error instanceof ClosureStop && error.message === message,
  );
  assert.deepEqual(fx.state.calls, []);
});

test("record still needs the handoff matrix", () => {
  const args = { repository: REPO, result: "result.json" };
  assert.equal(COMMANDS.record(args, NOT_TARGET_REPOSITORY), false);
});

test("record-legacy rejects structured-path options", () => {
  const base = { repository: REPO, pull: "62", issue: "61" };
  assert.equal(COMMANDS["record-legacy"]({ ...base, "handoff-file": "x" }, NOT_TARGET_REPOSITORY), false);
  assert.equal(COMMANDS["record-legacy"]({ ...base, children: "1" }, NOT_TARGET_REPOSITORY), false);
});
