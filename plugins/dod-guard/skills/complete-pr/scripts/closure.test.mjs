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
  for (const argv of [[], ["close"], ["plan"], ["plan", "snapshot.json"], ["record", "--repository=a/b"]]) {
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

test("a stop reports its partial state and exits 1", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  const io = capture();
  assert.equal(runCli(["apply", `--snapshot=${await saved("snapshot.json", snapshot)}`], { runner: github.runner, ...io }), 1);
  assert.match(io.text.err, /closure apply failed: issue #777 readback disagrees with the planned close/);
  assert.match(io.text.err, /"state":"open"/);
});
