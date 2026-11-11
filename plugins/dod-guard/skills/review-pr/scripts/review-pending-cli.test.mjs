import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const HEAD = "0a0a".repeat(10);
const BOTH = ["b01", "b02"];

const run = (command, flags) => spawnSync(process.execPath, [SCRIPT, command, ...flags], { encoding: "utf8" });
const names = (entries) => entries.map((entry) => entry.batch);
const q = (slot, n) => ({ id: `Q${slot}${n}`, lens: "review-pr-feature", question: "q?", files: ["a.mjs"] });

// Two slots of five questions: no two slots fit one batch, so the plan cuts into b01 and b02.
function setup(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-pending-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plan = path.join(dir, "plan.json");
  const slots = [0, 1].map((s) => ({ slot: `file:f${s}.mjs`, questions: [0, 1, 2, 3, 4].map((n) => q(s, n)) }));
  writeFileSync(plan, JSON.stringify(slots));
  const cut = run("batches", [`--plan=${plan}`, `--head=${HEAD}`, `--out-dir=${dir}`]);
  assert.equal(cut.status, 0, cut.stderr);
  const answers = path.join(dir, "answers");
  mkdirSync(answers);
  return { dir, answers, plan, files: JSON.parse(cut.stdout).batches };
}

// The answers file an investigator writes for one batch, with every question answered.
function whole(batchFile) {
  const doc = JSON.parse(readFileSync(batchFile, "utf8"));
  const answer = (a) => ({ slot: a.slot, id: a.id, status: "answered", path: "a.mjs", line: 1, fact: "x" });
  return { planHash: doc.planHash, headSha: doc.headSha, batch: doc.batch, answers: doc.questions.map(answer) };
}

// A change is a function over the whole answers file, or the raw text to write instead.
function place(env, changes) {
  for (const { batch, file } of env.files.filter(({ batch: name }) => name in changes)) {
    const change = changes[batch];
    const text = typeof change === "string" ? change : JSON.stringify(change(whole(file)));
    writeFileSync(path.join(env.answers, `${batch}.json`), text);
  }
}

function pendingOf(env, answersDir = env.answers) {
  const result = run("pending", [`--plan=${env.plan}`, `--head=${HEAD}`, `--answers-dir=${answersDir}`]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const keep = (doc) => doc;
const wrongHead = (doc) => ({ ...doc, headSha: "f".repeat(40) });
const dropFirst = (doc) => ({ ...doc, answers: doc.answers.slice(1) });
const missing = /^b01: answers file .* is missing$/;
const CASES = [
  ["lists every batch when no answers exist", {}, [], BOTH, missing],
  ["lists every batch as done when all are answered", { b01: keep, b02: keep }, BOTH, [], /^$/],
  ["separates an answered batch from a missing one", { b02: keep }, ["b02"], ["b01"], missing],
  ["counts a truncated file as pending", { b01: '{"planHash": "ab' }, [], BOTH, /^b01: Cannot read JSON from /],
  ["counts a file for another head as pending", { b01: wrongHead }, [], BOTH, /^b01: headSha is/],
  ["counts a file that lacks an answer as pending", { b01: dropFirst }, [], BOTH, /^b01: missing answer for Q00$/],
];

for (const [name, put, done, todo, problem] of CASES) {
  test(`pending ${name} and writes nothing`, (t) => {
    const env = setup(t);
    place(env, put);
    const out = pendingOf(env);
    assert.deepEqual([out.done, names(out.pending)], [done, todo]);
    assert.match(out.pending[0]?.problems[0] ?? "", problem);
    const written = Object.keys(put).map((batch) => `${batch}.json`);
    assert.deepEqual(readdirSync(env.answers), written);
  });
}

test("pending reads a missing directory as all pending, then sees a rewritten file as done", (t) => {
  const env = setup(t);
  assert.deepEqual(names(pendingOf(env, path.join(env.dir, "never-made")).pending), BOTH);
  place(env, { b01: "{broken" });
  assert.deepEqual(pendingOf(env).done, []);
  place(env, { b01: keep });
  const out = pendingOf(env);
  assert.deepEqual([out.done, names(out.pending)], [["b01"], ["b02"]]);
});

test("pending runs with its flags and refuses a missing flag, a short head and an extra flag", (t) => {
  const env = setup(t);
  const flags = [`--plan=${env.plan}`, `--head=${HEAD}`, `--answers-dir=${env.answers}`];
  assert.equal(run("pending", flags).status, 0);
  for (const bad of [flags.slice(0, 2), [flags[0], "--head=abc", flags[2]], [...flags, "--out=x.json"]]) {
    const result = run("pending", bad);
    assert.equal([result.status, result.stderr.startsWith("Usage:")].join(), "3,true", bad.join(" "));
  }
});
