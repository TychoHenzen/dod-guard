import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "./closure.mjs";
import { capture } from "./fixtures/closure-cli.mjs";
import { fakeGitHub, mergeResult, REPOSITORY, recordedSnapshot } from "./lib/closure.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("closure.mjs", import.meta.url));
const HANDOFF = '## Implementation handoff\n\n## Acceptance matrix\n\n```json\n[{"id":"AC-01","status":"pass"}]\n```\n';
const utf8Bom = (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
const utf16Bom = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);

async function savedBytes(name, bytes) {
  const file = join(await mkdtemp(join(tmpdir(), "closure-encoding-")), name);
  await writeFile(file, bytes);
  return file;
}

function planRun(file) {
  return spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
}

test("plan gives one plan for a snapshot saved plain, with a UTF-8 byte-order mark, or as marked UTF-16", async () => {
  const text = JSON.stringify(recordedSnapshot({ roots: [840] }));
  const plans = [];
  for (const bytes of [Buffer.from(text, "utf8"), utf8Bom(text), utf16Bom(text)]) {
    const run = planRun(await savedBytes("snapshot.json", bytes));
    assert.equal(run.status, 0, run.stderr);
    plans.push(JSON.parse(run.stdout));
  }
  assert.deepEqual(plans[1], plans[0]);
  assert.deepEqual(plans[2], plans[0]);
});

test("plan refuses a snapshot that is not UTF-8 text and names the file", async () => {
  const file = await savedBytes("latin1.json", Buffer.from([0x7b, 0xe9, 0x7d]));
  const run = planRun(file);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.startsWith(`closure plan failed: Cannot read JSON from ${file}: `), run.stderr);
  assert.match(run.stderr, /is not UTF-8 text; save it as UTF-8/);
});

test("record reads a result and a handoff saved as marked UTF-16 like the plain files", async () => {
  const result = JSON.stringify(mergeResult([840]));
  const records = [];
  for (const encode of [(text) => Buffer.from(text, "utf8"), utf16Bom]) {
    const github = fakeGitHub(recordedSnapshot({ roots: [840] }));
    const io = capture();
    const argv = [
      "record",
      `--repository=${REPOSITORY}`,
      `--result=${await savedBytes("result.json", encode(result))}`,
      `--handoff-file=${await savedBytes("handoff.md", encode(HANDOFF))}`,
    ];
    assert.equal(runCli(argv, { runner: github.runner, ...io }), 0, io.text.err);
    records.push(JSON.parse(io.text.out).records);
  }
  assert.deepEqual(records[1], records[0]);
});
