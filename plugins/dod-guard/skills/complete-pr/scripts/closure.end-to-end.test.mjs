import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "./closure.mjs";
import { capture, saved } from "./fixtures/closure-cli.mjs";
import { fakeGitHub, recordedSnapshot } from "./lib/closure.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("./closure.mjs", import.meta.url));
const CLOSE_ORDER = [775, 776, 777, 778, 683];

// Names each gh call by what it does, folding runs of the same kind, so the
// order of one close reads as a sentence.
const ISSUE_METHOD_KINDS = { POST: "comment", PATCH: "close" };

function methodOf(args) {
  const index = args.indexOf("--method");
  return index === -1 ? "GET" : args[index + 1];
}

function callKind(args) {
  const method = methodOf(args);
  if (args.some((value) => String(value).startsWith("users/"))) {
    return method === "GET" ? "project-read" : "project-status";
  }
  return ISSUE_METHOD_KINDS[method] ?? "read";
}

function callKinds(calls) {
  const kinds = calls.map(callKind);
  return kinds.filter((kind, index) => kind !== kinds[index - 1]);
}

test("end to end: plan and apply on the #683 hierarchy", async () => {
  const snapshot = recordedSnapshot();
  const file = await saved("snapshot.json", snapshot);
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(
    plan.closes.map(({ issue, rule, stateReason }) => [issue, rule, stateReason]),
    [
      [775, "replaced-original", "completed"],
      [776, "replaced-original", "completed"],
      [777, "replaced-original", "completed"],
      [778, "replaced-original", "completed"],
      [683, "parent", "completed"],
    ],
  );
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
  assert.deepEqual(
    plan.deliveries.map(({ root, status }) => [root, status]),
    [
      [818, "verified"],
      [820, "verified"],
      [840, "verified"],
      [841, "verified"],
    ],
  );

  const github = fakeGitHub(snapshot);
  const io = capture();
  assert.equal(runCli(["apply", `--snapshot=${file}`], { runner: github.runner, ...io }), 0, io.text.err);
  assert.deepEqual(JSON.parse(io.text.out).applied, CLOSE_ORDER);
  const firstClose = github.calls.slice(
    0,
    github.calls.findIndex((args) => args.includes("PATCH") && String(args[3]).startsWith("users/")) + 2,
  );
  assert.deepEqual(callKinds(firstClose), [
    "read",
    "comment",
    "close",
    "read",
    "project-read",
    "project-status",
    "project-read",
  ]);
  for (const number of CLOSE_ORDER) {
    assert.equal(github.state.issues.get(number).state, "closed");
    assert.equal(github.state.statuses.get(`PVTI_${number}`), "Done");
  }
});

test("end to end: the recorded state with #840 and #841 unmerged holds and reports", async () => {
  const snapshot = recordedSnapshot({ record: { 840: null, 841: null } });
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${await saved("snapshot.json", snapshot)}`], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(
    plan.closes.map(({ issue }) => issue),
    [775, 776],
  );
  assert.deepEqual(
    plan.holds.map(({ issue }) => issue),
    [777, 778, 683],
  );
  assert.deepEqual(
    plan.reports.map(({ issue, kind }) => [issue, kind]),
    [
      [840, "unverified-closed"],
      [841, "unverified-closed"],
    ],
  );
});

test("a stop reports its partial state and exits 1", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  const io = capture();
  assert.equal(
    runCli(["apply", `--snapshot=${await saved("snapshot.json", snapshot)}`], { runner: github.runner, ...io }),
    1,
  );
  assert.match(io.text.err, /closure apply failed: issue #777 readback disagrees with the planned close/);
  assert.match(io.text.err, /"state":"open"/);
});

test("apply runs on a snapshot built to the documented closure snapshot shape", async () => {
  const TopKeys = ["repository", "defaultBranch", "project", "items", "issues", "pullRequests"];
  const ProjectKeys = ["owner", "number", "statusFieldId", "doneOptionId"];
  const ItemKeys = ["id", "content", "fields"];
  const IssueKeys = [
    "number",
    "repository",
    "state",
    "title",
    "parent",
    "children",
    "body",
    "state_reason",
    "comments",
  ];
  const PullKeys = ["number", "repository", "state", "mergedAt", "head", "base", "mergeCommit", "requiredChecks"];
  const pick = (record, keys) =>
    Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
  const snapshot = recordedSnapshot();
  const documented = pick(snapshot, TopKeys);
  documented.project = pick(snapshot.project, ProjectKeys);
  documented.items = snapshot.items.map((entry) => pick(entry, ItemKeys));
  documented.issues = snapshot.issues.map((entry) => pick(entry, IssueKeys));
  documented.pullRequests = snapshot.pullRequests.map((entry) => pick(entry, PullKeys));
  const github = fakeGitHub(documented);
  const io = capture();
  const file = await saved("snapshot.json", documented);
  assert.equal(runCli(["apply", `--snapshot=${file}`], { runner: github.runner, ...io }), 0, io.text.err);
  assert.deepEqual(JSON.parse(io.text.out).applied, CLOSE_ORDER);
  for (const number of CLOSE_ORDER) {
    assert.equal(github.state.statuses.get(`PVTI_${number}`), "Done");
  }
});
