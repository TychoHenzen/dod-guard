import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "./closure.mjs";
import { capture, saved, shippedPlan } from "./fixtures/closure-cli.mjs";
import {
  DELIVERIES,
  fakeGitHub,
  mergeResult,
  patchesTo,
  quotingComment,
  REPOSITORY,
  recordedSnapshot,
} from "./lib/closure.test-support.mjs";

test("the shipped plan command prints the planned close for a verified root", async () => {
  const file = await saved("snapshot.json", recordedSnapshot({ roots: [840] }));
  const plan = shippedPlan(file);
  assert.deepEqual(
    plan.closes.map(({ issue, rule }) => [issue, rule]),
    [[777, "replaced-original"]],
  );
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
  assert.equal(
    runCli(["apply", `--snapshot=${snapshotFile}`], { runner: github.runner, ...applyIo }),
    0,
    applyIo.text.err,
  );
  assert.deepEqual(JSON.parse(applyIo.text.out).applied, [777]);

  const result = mergeResult([840]);
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

test("the shipped record command posts its own record and leaves a quoting handoff unchanged", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.issues.find(({ number }) => number === 840).comments = [quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const handoff = github.state.issues.get(840).comments[0].body;
  const result = mergeResult([840]);
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", result)}`,
    `--matrix=${await saved("matrix.json", [{ id: "AC-01", status: "pass" }])}`,
  ];

  const first = capture();
  assert.equal(runCli(argv, { runner: github.runner, ...first }), 0, first.text.err);
  assert.deepEqual(JSON.parse(first.text.out).records, [{ issue: 840, action: "posted" }]);
  assert.equal(github.state.issues.get(840).comments[0].body, handoff);
  assert.deepEqual(patchesTo(github, 7001), []);

  const second = capture();
  assert.equal(runCli(argv, { runner: github.runner, ...second }), 0, second.text.err);
  assert.deepEqual(JSON.parse(second.text.out).records, [{ issue: 840, action: "unchanged" }]);
  assert.equal(github.state.issues.get(840).comments[0].body, handoff);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(github.state.issues.get(840).comments.length, 2);
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
