import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "./closure.mjs";
import { DELIVERIES, REPOSITORY, fakeGitHub, recordedSnapshot } from "./lib/closure.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("./closure.mjs", import.meta.url));

async function saved(name, value) {
  const directory = await mkdtemp(join(tmpdir(), "closure-"));
  const file = join(directory, name);
  await writeFile(file, JSON.stringify(value));
  return file;
}

function capture() {
  const text = { out: "", err: "" };
  return {
    text,
    stdout: { write: (chunk) => (text.out += chunk) },
    stderr: { write: (chunk) => (text.err += chunk) },
  };
}

test("the shipped plan command prints the planned close for a verified root", async () => {
  const file = await saved("snapshot.json", recordedSnapshot({ roots: [840] }));
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [[777, "replaced-original"]]);
});

test("the command rejects an unknown command or a missing flag", () => {
  const invalid = [
    [],
    ["close"],
    ["plan"],
    ["plan", "snapshot.json"],
    ["record", "--repository=a/b"],
    ["plan", "--snapshot=snapshot.json", "--hierarchy=epic"],
  ];
  for (const argv of invalid) {
    const io = capture();
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.match(io.text.err, /usage: closure\.mjs plan --snapshot=<file\.json>/);
  }
});

test("apply and record run through the injected gh runner", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  const applyIo = capture();
  const snapshotFile = await saved("snapshot.json", snapshot);
  assert.equal(runCli(["apply", `--snapshot=${snapshotFile}`], { runner: github.runner, ...applyIo }), 0, applyIo.text.err);
  assert.deepEqual(JSON.parse(applyIo.text.out).applied, [777]);

  const result = {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: [{ number: 840, state: "CLOSED" }],
  };
  const recordIo = capture();
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", result)}`,
    `--matrix=${await saved("matrix.json", [{ id: "AC-01", status: "pass" }])}`,
  ];
  assert.equal(runCli(argv, { runner: github.runner, ...recordIo }), 0, recordIo.text.err);
  assert.deepEqual(JSON.parse(recordIo.text.out).records, [{ issue: 840, action: "unchanged" }]);
});

test("record rejects a malformed --children list before any call", async () => {
  const result = await saved("result.json", {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: [{ number: 840 }],
  });
  const matrix = await saved("matrix.json", [{ id: "AC-01", status: "pass" }]);
  for (const flag of ["--children=12,abc", "--children=12,", "--children=0", "--children=-3", "--children"]) {
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    };
    const io = capture();
    const argv = ["record", `--repository=${REPOSITORY}`, `--result=${result}`, `--matrix=${matrix}`, flag];
    assert.equal(runCli(argv, { runner, ...io }), 2, flag);
    assert.match(io.text.err, /usage: closure\.mjs plan --snapshot=<file\.json>/, flag);
    assert.deepEqual(calls, [], flag);
  }
});

// Names each gh call by what it does, folding runs of the same kind, so the
// order of one close reads as a sentence.
function callKinds(calls) {
  const kinds = calls.map((args) => {
    const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
    const project = args.some((value) => String(value).startsWith("users/"));
    if (project) return method === "GET" ? "project-read" : "project-status";
    if (method === "POST") return "comment";
    if (method === "PATCH") return "close";
    return "read";
  });
  return kinds.filter((kind, index) => kind !== kinds[index - 1]);
}

test("end to end: plan and apply on the #683 hierarchy", async () => {
  const snapshot = recordedSnapshot();
  const file = await saved("snapshot.json", snapshot);
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue, rule, stateReason }) => [issue, rule, stateReason]), [
    [775, "replaced-original", "completed"],
    [776, "replaced-original", "completed"],
    [777, "replaced-original", "completed"],
    [778, "replaced-original", "completed"],
    [683, "parent", "completed"],
  ]);
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
  assert.deepEqual(plan.deliveries.map(({ root, status }) => [root, status]), [
    [818, "verified"],
    [820, "verified"],
    [840, "verified"],
    [841, "verified"],
  ]);

  const github = fakeGitHub(snapshot);
  const io = capture();
  assert.equal(runCli(["apply", `--snapshot=${file}`], { runner: github.runner, ...io }), 0, io.text.err);
  assert.deepEqual(JSON.parse(io.text.out).applied, [775, 776, 777, 778, 683]);
  const firstClose = github.calls.slice(0, github.calls.findIndex((args) => args.includes("PATCH") && String(args[3]).startsWith("users/")) + 2);
  assert.deepEqual(callKinds(firstClose), ["read", "comment", "close", "read", "project-read", "project-status", "project-read"]);
  for (const number of [775, 776, 777, 778, 683]) {
    assert.equal(github.state.issues.get(number).state, "closed");
    assert.equal(github.state.statuses.get(number), "Done");
  }
});

test("end to end: the recorded state with #840 and #841 unmerged holds and reports", async () => {
  const snapshot = recordedSnapshot({ record: { 840: null, 841: null } });
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${await saved("snapshot.json", snapshot)}`], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue }) => issue), [775, 776]);
  assert.deepEqual(plan.holds.map(({ issue }) => issue), [777, 778, 683]);
  assert.deepEqual(plan.reports.map(({ issue, kind }) => [issue, kind]), [
    [840, "unverified-closed"],
    [841, "unverified-closed"],
  ]);
});

test("a stop reports its partial state and exits 1", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  const io = capture();
  assert.equal(runCli(["apply", `--snapshot=${await saved("snapshot.json", snapshot)}`], { runner: github.runner, ...io }), 1);
  assert.match(io.text.err, /closure apply failed: issue #777 readback disagrees with the planned close/);
  assert.match(io.text.err, /"state":"open"/);
});
