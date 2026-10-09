import assert from "node:assert/strict";
import test from "node:test";
import { applyClosures, recordCompletion } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import { parseCompletionRecord, recordComments, renderClosureEvidence } from "./closure-records.mjs";
import {
  DELIVERIES,
  REPOSITORY,
  completionComment,
  fakeGitHub,
  mutating,
  quotingComment,
  recordedSnapshot,
  snapshotAfter,
} from "./closure.test-support.mjs";

function evidenceCount(github, issue) {
  return recordComments(github.state.issues.get(issue).comments, "closure").length;
}

test("apply comments, closes, reads back, and sets Done for a replaced original", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [777]);
  assert.deepEqual(result.steps.map(({ step }) => step), ["read", "comment", "close", "readback", "project-status"]);
  const closed = github.state.issues.get(777);
  assert.equal(closed.state, "closed");
  assert.equal(closed.state_reason, "completed");
  assert.match(closed.comments[0].body, /Superseded by #840, delivered by pull request #901/);
  assert.equal(github.state.statuses.get(777), "Done");
});

test("apply makes no mutating call when every close is held", () => {
  for (const options of [
    { record: { 840: null } },
    { record: { 840: { pendingRows: ["AC-11"] } } },
    { pull: { 840: { checks: "fail" } } },
  ]) {
    const snapshot = recordedSnapshot({ roots: [840], ...options });
    const github = fakeGitHub(snapshot);
    const result = applyClosures(snapshot, { runner: github.runner });
    assert.deepEqual(result.applied, []);
    assert.deepEqual(github.calls, []);
  }
});

test("apply stops before writing when the root no longer verifies live", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  github.state.issues.get(840).comments[0].body =
    github.state.issues.get(840).comments[0].body.replace("[]", '["AC-11"]');
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /root #840 no longer verifies/);
  assert.deepEqual(github.calls.filter(mutating), []);
});

test("a rerun after a failed close posts no second comment and finishes the close", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const failClose = (args) => mutating(args) && args.includes("state=closed");
  const github = fakeGitHub(snapshot, { failOnce: failClose });
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), (error) => {
    assert.equal(error.code, "closure_stop");
    assert.deepEqual(error.state.steps.map(({ step }) => step), ["read", "comment"]);
    return true;
  });
  assert.equal(evidenceCount(github, 777), 1);
  assert.equal(github.state.issues.get(777).state, "open");
  const rerun = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(rerun.steps.map(({ step }) => step), ["read", "close", "readback", "project-status"]);
  assert.equal(evidenceCount(github, 777), 1);
  assert.equal(github.state.issues.get(777).state, "closed");
  assert.equal(github.state.statuses.get(777), "Done");
});

test("a rerun after a stopped Done write sets Done without another comment or close", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const failDone = (args) => mutating(args) && args.some((value) => String(value).startsWith("users/"));
  const github = fakeGitHub(snapshot, { failOnce: failDone });
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), (error) => {
    assert.equal(error.code, "closure_stop");
    assert.deepEqual(error.state.steps.map(({ step }) => step), ["read", "comment", "close", "readback"]);
    return true;
  });
  assert.equal(github.state.issues.get(777).state, "closed");
  assert.equal(github.state.statuses.get(777), "Backlog");

  const after = snapshotAfter(snapshot, github);
  const replanned = planClosures(after);
  assert.deepEqual(replanned.closes, []);
  assert.deepEqual(replanned.statusRepairs, [{ issue: 777, itemId: "PVTI_777", status: "Backlog" }]);

  const mark = github.calls.length;
  const rerun = applyClosures(after, { runner: github.runner });
  assert.deepEqual(rerun.repaired, [777]);
  assert.deepEqual(rerun.applied, []);
  const writes = github.calls.slice(mark).filter(mutating);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].some((value) => String(value).startsWith("users/")));
  assert.equal(github.state.statuses.get(777), "Done");
  assert.equal(evidenceCount(github, 777), 1);
});

test("a status repair stops when the issue was reopened", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const failDone = (args) => mutating(args) && args.some((value) => String(value).startsWith("users/"));
  const github = fakeGitHub(snapshot, { failOnce: failDone });
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), (error) => {
    assert.equal(error.code, "closure_stop");
    assert.deepEqual(error.state.steps.map(({ step }) => step), ["read", "comment", "close", "readback"]);
    return true;
  });
  const after = snapshotAfter(snapshot, github);
  github.state.issues.get(777).state = "open";
  const mark = github.calls.length;
  assert.throws(() => applyClosures(after, { runner: github.runner }), /issue #777 is no longer closed/);
  assert.deepEqual(github.calls.slice(mark).filter(mutating), []);
});

test("a readback that disagrees stops with the actual state and no further mutation", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), (error) => {
    assert.match(error.message, /issue #777 readback disagrees/);
    assert.equal(error.state.state, "open");
    assert.equal(error.state.evidenceComments, 1);
    return true;
  });
  const lastMutation = github.calls.filter(mutating).at(-1);
  assert.ok(lastMutation.includes("state=closed"));
  assert.equal(github.state.statuses.get(777), "Backlog");
});

test("apply refuses to write without the Project identity", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  delete snapshot.project;
  const github = fakeGitHub(snapshot);
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /snapshot.project needs/);
  assert.deepEqual(github.calls, []);
});

test("record posts one completion record per closing issue and child, then updates it in place", () => {
  const snapshot = recordedSnapshot();
  const github = fakeGitHub(snapshot);
  const result = {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: [{ number: 683, state: "CLOSED" }],
  };
  const matrix = [{ id: "AC-01", status: "pass" }, { id: "AC-11", status: "unverified" }];
  const first = recordCompletion({ repository: REPOSITORY, result, matrix, children: [777], runner: github.runner });
  assert.deepEqual(first.records, [{ issue: 683, action: "posted" }, { issue: 777, action: "posted" }]);
  const marked = recordComments(github.state.issues.get(683).comments, "completion");
  assert.equal(marked.length, 1);
  assert.match(marked[0].body, /"pendingRows": \[\n {4}"AC-11"\n {2}\]/);
  const settled = [{ id: "AC-01", status: "pass" }, { id: "AC-11", status: "pass" }];
  const second = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(second.records, [{ issue: 683, action: "updated" }]);
  const again = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(again.records, [{ issue: 683, action: "unchanged" }]);
  assert.match(github.state.issues.get(683).comments.at(-1).body, /"pendingRows": \[\]/);
});

test("record rejects an incomplete merge result before any call", () => {
  const github = fakeGitHub(recordedSnapshot());
  const result = { pullNumber: 901, trustedHead: "abc", mergeCommitSha: DELIVERIES[840].merge, linkedIssues: [] };
  assert.throws(
    () => recordCompletion({ repository: REPOSITORY, result, matrix: [], runner: github.runner }),
    /merge result needs/,
  );
  assert.deepEqual(github.calls, []);
});

function mergeResult(linked) {
  return {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: linked.map((number) => ({ number, state: "CLOSED" })),
  };
}

function patchesTo(github, commentId) {
  return github.calls.filter(
    (args) => mutating(args) && args.some((value) => String(value).endsWith(`/issues/comments/${commentId}`)),
  );
}

test("record posts its own record and never edits a comment that quotes the markers", () => {
  const snapshot = recordedSnapshot();
  snapshot.issues.find(({ number }) => number === 683).comments = [quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "posted" }] });
  assert.equal(github.state.issues.get(683).comments[0].body, before);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(recordComments(github.state.issues.get(683).comments, "completion").length, 1);
  assert.equal(github.state.issues.get(683).comments.length, 2);
});

test("record updates only the real record when a quoting comment sits beside it", () => {
  const snapshot = recordedSnapshot();
  snapshot.issues.find(({ number }) => number === 683).comments = [
    quotingComment(7001),
    completionComment(840, { pendingRows: ["AC-11"] }),
  ];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const settled = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "pass" },
  ];
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: settled,
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "updated" }] });
  assert.equal(patchesTo(github, 84_001).length, 1);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(github.state.issues.get(683).comments[0].body, before);
  const records = recordComments(github.state.issues.get(683).comments, "completion");
  assert.equal(records.length, 1);
  assert.match(records[0].body, /"pendingRows": \[\]/);
});

test("record repairs a malformed real record in place instead of posting a second", () => {
  const snapshot = recordedSnapshot();
  const broken = { id: 555, body: completionComment(840).body.replace('"pullRequest"', '"pullRequest" oops') };
  snapshot.issues.find(({ number }) => number === 683).comments = [quotingComment(7001), broken];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "updated" }] });
  assert.equal(patchesTo(github, 555).length, 1);
  const { comments } = github.state.issues.get(683);
  assert.equal(comments.length, 2);
  assert.equal(parseCompletionRecord(comments).record.commentId, 555);
  assert.equal(comments[0].body, before);
});

test("apply posts real closure evidence when the only marker text is a quote", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.issues.find(({ number }) => number === 777).comments = [quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const quote = github.state.issues.get(777).comments[0].body;
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [777]);
  assert.deepEqual(result.steps.map(({ step }) => step), ["read", "comment", "close", "readback", "project-status"]);
  const closed = github.state.issues.get(777);
  assert.equal(closed.state, "closed");
  assert.equal(evidenceCount(github, 777), 1);
  assert.equal(closed.comments.length, 2);
  assert.equal(closed.comments.find(({ id }) => id === 7001).body, quote);
  assert.ok(github.calls.some((args) => args.includes("POST") && args.includes(`repos/${REPOSITORY}/issues/777/comments`)));
});

test("apply is not stopped as duplicate by a quote beside real closure evidence", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const evidence = renderClosureEvidence({ issue: 777, stateReason: "completed", evidence: ["Superseded by #840."] });
  snapshot.issues.find(({ number }) => number === 777).comments = [{ id: 7002, body: evidence }, quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const quote = github.state.issues.get(777).comments[1].body;
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [777]);
  assert.deepEqual(result.steps.map(({ step }) => step), ["read", "close", "readback", "project-status"]);
  assert.equal(evidenceCount(github, 777), 1);
  const posts = github.calls.filter((args) => args.includes("POST") && args.includes(`repos/${REPOSITORY}/issues/777/comments`));
  assert.deepEqual(posts, []);
  assert.equal(github.state.issues.get(777).comments[1].body, quote);
});
