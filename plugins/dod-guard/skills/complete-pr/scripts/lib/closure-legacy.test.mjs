// Tests for record-legacy: the guard reads, the refusal table, the one write, and the judgement a
// legacy record gets from the same delivery rules as any other completion record.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexSnapshot } from "../../../../lib/closure-index.mjs";
import { DELIVERIES, recordedSnapshot } from "./closure.test-support.mjs";
import { ClosureStop } from "./closure-apply.mjs";
import { COMMANDS } from "./closure-commands.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";
import { recordLegacyDelivery } from "./closure-legacy.mjs";
import { parseCompletionRecord, renderCompletionRecord } from "./closure-records.mjs";

const SHA_LENGTH = 40;
const REPO = "o/r";
const ISSUE = 61;
const PULL = 62;
const LEGACY = 818;
const HEAD = "a".repeat(SHA_LENGTH);
const MERGE = "b".repeat(SHA_LENGTH);
const MOVED_HEAD = "c".repeat(SHA_LENGTH);
const MOVED_MERGE = "d".repeat(SHA_LENGTH);
const OTHER = "e".repeat(SHA_LENGTH);
const CHECK_REASON = "required checks are incomplete or failed";
const REPOS_PATH = /^repos\//;
const ISSUE_COMMENTS = /\/issues\/61\/comments/;
const CHECK_RUNS = /^repos\/o\/r\/commits\/([0-9a-f]{40})\/check-runs/;
const COMMIT_STATUS = /^repos\/o\/r\/commits\/([0-9a-f]{40})\/status/;
const BODY_PREFIX = "body=";
const NOT_TARGET_REPOSITORY = () => {
  throw new Error("no read was expected");
};

function reply(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function methodOf(args) {
  if (args.includes("--method")) {
    return args[args.indexOf("--method") + 1];
  }
  return "GET";
}

function bodyOf(args) {
  return String(args.find((value) => String(value).startsWith(BODY_PREFIX))).slice(BODY_PREFIX.length);
}

// POST creates a comment and PATCH rewrites one; any other method is a read and returns null.
function answerWrite(state, method, endpoint, args) {
  if (method === "POST") {
    state.comments.push({ id: state.nextId, body: bodyOf(args) });
    state.nextId += 1;
    state.writes.push({ method, endpoint });
    return reply({ id: state.nextId - 1 });
  }
  if (method === "PATCH") {
    const id = Number(endpoint.split("/").pop());
    state.comments.find((comment) => comment.id === id).body = bodyOf(args);
    state.writes.push({ method, endpoint });
    return reply({});
  }
  return null;
}

function checkRunsReply(state, sha) {
  const run = { name: "build-test", head_sha: sha, status: "completed", conclusion: state.checkConclusion };
  return reply([{ total_count: 1, check_runs: [run] }]);
}

function answerRead(state, endpoint) {
  if (endpoint === `repos/${REPO}`) {
    return reply({ default_branch: state.defaultBranch });
  }
  if (endpoint === `repos/${REPO}/pulls/${PULL}`) {
    return reply(state.pull);
  }
  if (endpoint === `repos/${REPO}/issues/${ISSUE}`) {
    return reply(state.issue);
  }
  if (endpoint === `repos/${REPO}/branches/main/protection/required_status_checks`) {
    return reply({ contexts: ["build-test"] });
  }
  const checkSha = endpoint.match(CHECK_RUNS)?.[1];
  if (checkSha) {
    return checkRunsReply(state, checkSha);
  }
  const statusSha = endpoint.match(COMMIT_STATUS)?.[1];
  if (statusSha) {
    return reply([{ sha: statusSha, state: "success", statuses: [] }]);
  }
  return { status: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
}

// A delivery the guard accepts: issue 61 closed, pull 62 merged onto main by "Closes #61", and the one
// required check passing on the head. Each refusal test changes one field of it before the call.
function fixture() {
  const state = {
    defaultBranch: "main",
    issue: { number: ISSUE, state: "closed", state_reason: "completed", body: "## Idea\n\nx\n" },
    pull: {
      number: PULL,
      merged_at: "2026-10-30T10:00:00Z",
      merge_commit_sha: MERGE,
      base: { ref: "main" },
      head: { sha: HEAD, repo: { full_name: REPO } },
      body: "Closes #61",
    },
    comments: [],
    checkConclusion: "success",
    nextId: 100,
    writes: [],
    calls: [],
  };
  const runner = (args) => {
    state.calls.push(args);
    const endpoint = String(args.find((value) => REPOS_PATH.test(String(value))));
    // Only the comments read answers with the comment list; the check-run and status reads also slurp pages.
    if (args.includes("--slurp") && ISSUE_COMMENTS.test(endpoint)) {
      return reply([state.comments]);
    }
    return answerWrite(state, methodOf(args), endpoint, args) ?? answerRead(state, endpoint);
  };
  return { state, runner };
}

function legacyOf(fx) {
  return recordLegacyDelivery({ repository: REPO, pull: PULL, issue: ISSUE, runner: fx.runner });
}

function refusalOf(fx) {
  try {
    legacyOf(fx);
  } catch (error) {
    return error;
  }
  throw new Error("record-legacy wrote a record for a delivery it should refuse");
}

function set(target, key, value) {
  target[key] = value;
}

const STRUCTURED_BODY = (name) => `## Implementation notes\n\n### ${name}\n\n- [ ] x\n`;

const REFUSALS = [
  { name: "an open issue", change: (fx) => set(fx.state.issue, "state", "open"), reason: "issue #61 is not closed" },
  {
    name: "a structured task-list",
    change: (fx) => set(fx.state.issue, "body", STRUCTURED_BODY("task-list")),
    reason: "issue #61 holds structured record task-list",
  },
  {
    name: "a structured requirements record",
    change: (fx) => set(fx.state.issue, "body", STRUCTURED_BODY("requirements")),
    reason: "issue #61 holds structured record requirements",
  },
  {
    name: "a handoff comment",
    change: (fx) => fx.state.comments.push({ id: 7, body: "## Implementation handoff\n\nx\n" }),
    reason: "issue #61 has an implementation handoff comment",
  },
  {
    name: "an unmerged pull request",
    change: (fx) => set(fx.state.pull, "merged_at", null),
    reason: "pull request #62 is not merged",
  },
  {
    name: "a base other than the default branch",
    change: (fx) => set(fx.state.pull.base, "ref", "develop"),
    reason: "pull request #62 base is not the default branch",
  },
  {
    name: "a head repository other than the target",
    change: (fx) => set(fx.state.pull.head.repo, "full_name", "other/r"),
    reason: "pull request #62 head repository is not the target repository",
  },
  {
    name: "a body that closes another issue",
    change: (fx) => set(fx.state.pull, "body", "Closes #6"),
    reason: "pull request #62 body has no closing keyword for #61",
  },
  {
    name: "a body that only mentions the issue",
    change: (fx) => set(fx.state.pull, "body", "see #61"),
    reason: "pull request #62 body has no closing keyword for #61",
  },
  {
    name: "a missing merge commit",
    change: (fx) => set(fx.state.pull, "merge_commit_sha", null),
    reason: "pull request #62 merge commit or head is missing",
  },
  {
    name: "a missing head sha",
    change: (fx) => set(fx.state.pull.head, "sha", ""),
    reason: "pull request #62 merge commit or head is missing",
  },
  {
    name: "an incomplete required check",
    change: (fx) => set(fx.state, "checkConclusion", "failure"),
    reason: CHECK_REASON,
  },
  {
    name: "an existing completion record without the legacy flag",
    change: (fx) => {
      const body = renderCompletionRecord({
        pullRequest: 62,
        mergeCommit: MERGE,
        trustedHeadSha: HEAD,
        requiredChecks: "pass",
        pendingRows: [],
      });
      fx.state.comments.push({ id: 7, body });
    },
    reason: "issue #61 already has a non-legacy completion record",
  },
];

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

for (const row of REFUSALS) {
  test(`record-legacy refuses ${row.name} and writes nothing`, () => {
    const fx = fixture();
    row.change(fx);
    const error = refusalOf(fx);
    assert.ok(error instanceof ClosureStop);
    assert.ok(error.message.startsWith("legacy delivery refused: "), error.message);
    assert.ok(error.message.includes(row.reason), error.message);
    assert.ok(error.state.reasons.includes(row.reason), JSON.stringify(error.state.reasons));
    assert.deepEqual(fx.state.writes, []);
  });
}

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

test("a legacy record is judged like any other", () => {
  const snapshot = recordedSnapshot({ record: { [LEGACY]: { legacy: true } } });
  const judged = judgeDelivery(indexSnapshot(snapshot), LEGACY);
  assert.equal(judged.status, "verified");
  assert.equal(judged.record.legacy, true);

  const moved = recordedSnapshot({ record: { [LEGACY]: { legacy: true } } });
  moved.pullRequests.find(({ number }) => number === DELIVERIES[LEGACY].pull).mergeCommit.oid = OTHER;
  const mismatched = judgeDelivery(indexSnapshot(moved), LEGACY);
  assert.equal(mismatched.status, "unverified");
  assert.ok(mismatched.reasons.includes("merge commit differs from live readback"), JSON.stringify(mismatched));
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
