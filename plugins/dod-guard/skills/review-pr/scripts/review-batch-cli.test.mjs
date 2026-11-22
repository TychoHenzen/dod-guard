import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const PLAN = fileURLToPath(new URL("fixtures/pr-909/plan.json", import.meta.url));
const HEAD = "0909".repeat(10);
const HEX16 = /^[0-9a-f]{16}$/;

const dirs = [];
after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Every test writes into its own directory, so no test reads another's output.
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-batch-"));
  dirs.push(dir);
  return dir;
}

function run(command, flags) {
  return spawnSync(process.execPath, [SCRIPT, command, ...flags], { encoding: "utf8", shell: false });
}

function succeeds(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

// Cuts the fixture plan into batch files under dir/batches and returns the
// command's output.
function cut(dir) {
  return succeeds(run("batches", [`--plan=${PLAN}`, `--head=${HEAD}`, `--out-dir=${path.join(dir, "batches")}`]));
}

function answersDir(dir) {
  const answers = path.join(dir, "answers");
  mkdirSync(answers, { recursive: true });
  return answers;
}

// The answers file an investigator writes for one batch: every question answered.
function answeredFor(batchFile) {
  const doc = readJson(batchFile);
  return {
    planHash: doc.planHash,
    headSha: doc.headSha,
    batch: doc.batch,
    answers: doc.questions.map((q) => ({
      id: q.id,
      slot: q.slot,
      status: "answered",
      path: "a.mjs",
      line: 1,
      fact: "x",
    })),
  };
}

function writeAllAnswers(dir, batches) {
  const answers = answersDir(dir);
  for (const { batch, file } of batches) {
    writeFileSync(path.join(answers, `${batch}.json`), JSON.stringify(answeredFor(file)));
  }
  return answers;
}

function answerFlags(dir, out = path.join(dir, "answers.json")) {
  return [`--plan=${PLAN}`, `--head=${HEAD}`, `--answers-dir=${path.join(dir, "answers")}`, `--out=${out}`];
}

test("batches writes one stamped file per batch", () => {
  const dir = scratch();
  const { planHash, batches } = cut(dir);
  assert.match(planHash, HEX16);
  assert.ok(batches.length > 0);
  for (const { file, batch } of batches) {
    const doc = readJson(file);
    assert.equal(doc.planHash, planHash);
    assert.equal(doc.headSha, HEAD);
    assert.equal(doc.batch, batch);
    assert.ok(Array.isArray(doc.questions));
  }
});

test("answers merges the files the investigators wrote", () => {
  const dir = scratch();
  const { planHash, batches } = cut(dir);
  writeAllAnswers(dir, batches);
  const out = path.join(dir, "answers.json");
  const counts = succeeds(run("answers", answerFlags(dir, out)));
  const merged = readJson(out);
  const total = batches.reduce((sum, { questions }) => sum + questions, 0);
  assert.equal(merged.planHash, planHash);
  assert.equal(merged.headSha, HEAD);
  assert.equal(merged.answers.length, total);
  assert.deepEqual(counts, { out, answered: total, unanswered: 0 });
});

test("answers refuses a missing file and names it", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  rmSync(path.join(answers, "b01.json"));
  const out = path.join(dir, "answers.json");
  const result = run("answers", answerFlags(dir, out));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Answers refused[\s\S]*b01: answers file .* is missing/);
  assert.throws(() => readFileSync(out), { code: "ENOENT" });
});

test("answers refuses a non-JSON file", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  writeFileSync(path.join(answers, "b01.json"), "{not json");
  const result = run("answers", answerFlags(dir));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Answers refused[\s\S]*b01: Cannot read JSON from .*b01\.json/);
});

test("answers refuses a file stamped for another head", () => {
  const dir = scratch();
  const { batches } = cut(dir);
  const answers = writeAllAnswers(dir, batches);
  const stamped = path.join(answers, "b01.json");
  writeFileSync(stamped, JSON.stringify({ ...readJson(stamped), headSha: "f".repeat(40) }));
  const result = run("answers", answerFlags(dir));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /headSha is/);
});

test("batches and answers without a flag print usage", () => {
  for (const command of ["batches", "answers"]) {
    const result = run(command, []);
    assert.equal(result.status, 3, command);
    assert.ok(result.stderr.startsWith("Usage:"), command);
  }
});
