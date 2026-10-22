import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { runCli } from "./closure.mjs";
import { capture, saved, savedText, shippedPlan } from "./fixtures/closure-cli.mjs";
import {
  DELIVERIES,
  fakeGitHub,
  mergeResult,
  patchesTo,
  quotingComment,
  REPOSITORY,
  recordedSnapshot,
} from "./lib/closure.test-support.mjs";

const HANDOFF = '## Implementation handoff\n\n## Acceptance matrix\n\n```json\n[{"id":"AC-01","status":"pass"}]\n```\n';

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
    `--handoff-file=${await savedText("handoff.md", HANDOFF)}`,
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
    `--handoff-file=${await savedText("handoff.md", HANDOFF)}`,
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
  const handoff = await savedText("handoff.md", HANDOFF);
  for (const flag of ["--children=12,abc", "--children=12,", "--children=0", "--children=-3", "--children"]) {
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    };
    const io = capture();
    const argv = ["record", `--repository=${REPOSITORY}`, `--result=${result}`, `--handoff-file=${handoff}`, flag];
    assert.equal(runCli(argv, { runner, ...io }), 2, flag);
    assert.match(io.text.err, /usage: closure\.mjs plan --snapshot=<file\.json>/, flag);
    assert.deepEqual(calls, [], flag);
  }
});

test("record rejects the removed --matrix option", async () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stdout: "", stderr: "" };
  };
  const io = capture();
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", mergeResult([840]))}`,
    `--handoff-file=${await savedText("handoff.md", HANDOFF)}`,
    `--matrix=${await saved("matrix.json", [{ id: "AC-01", status: "pass" }])}`,
  ];
  assert.equal(runCli(argv, { runner, ...io }), 2);
  assert.match(io.text.err, /usage: closure\.mjs plan/);
  assert.deepEqual(calls, []);
});

test("record names a handoff with no matrix", async () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stdout: "", stderr: "" };
  };
  const io = capture();
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", mergeResult([840]))}`,
    `--handoff-file=${await savedText("handoff.md", "## Implementation handoff\n")}`,
  ];
  assert.equal(runCli(argv, { runner, ...io }), 1);
  assert.match(io.text.err, /handoff has no ## Acceptance matrix section/);
  assert.deepEqual(calls, []);
});

test("record accepts an empty --children list", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const result = await saved("result.json", mergeResult([840]));
  const handoff = await savedText("handoff.md", HANDOFF);
  const withEmpty = capture();
  const emptyGitHub = fakeGitHub(snapshot);
  assert.equal(
    runCli(["record", `--repository=${REPOSITORY}`, `--result=${result}`, `--handoff-file=${handoff}`, "--children="], {
      runner: emptyGitHub.runner,
      ...withEmpty,
    }),
    0,
    withEmpty.text.err,
  );
  const without = capture();
  const plainGitHub = fakeGitHub(snapshot);
  assert.equal(
    runCli(["record", `--repository=${REPOSITORY}`, `--result=${result}`, `--handoff-file=${handoff}`], {
      runner: plainGitHub.runner,
      ...without,
    }),
    0,
    without.text.err,
  );
  assert.deepEqual(JSON.parse(withEmpty.text.out).records, JSON.parse(without.text.out).records);
});

test("annotate --output writes the same snapshot it prints without --output", async () => {
  const file = await saved("snapshot.json", recordedSnapshot({ roots: [840] }));
  const printedIo = capture();
  assert.equal(runCli(["annotate", `--snapshot=${file}`], printedIo), 0, printedIo.text.err);
  const printed = JSON.parse(printedIo.text.out);

  const target = join(dirname(file), "annotated.json");
  const io = capture();
  assert.equal(runCli(["annotate", `--snapshot=${file}`, `--output=${target}`], io), 0, io.text.err);
  assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), printed);
  assert.deepEqual(Object.keys(JSON.parse(io.text.out)), ["output", "repository", "items"]);
});

test("annotate rejects an empty --output", async () => {
  const file = await saved("snapshot.json", recordedSnapshot({ roots: [840] }));
  const io = capture();
  assert.equal(runCli(["annotate", `--snapshot=${file}`, "--output="], io), 2);
  assert.equal(io.text.out, "");
});
