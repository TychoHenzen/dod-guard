import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const HEAD = "0a0a".repeat(10);

const run = (command, flags) => spawnSync(process.execPath, [SCRIPT, command, ...flags], { encoding: "utf8" });
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
  const root = path.join(dir, "checkout");
  mkdirSync(root);
  writeFileSync(path.join(root, "a.mjs"), "one\ntwo\nthree\n");
  return { dir, answers, plan, root, files: JSON.parse(cut.stdout).batches };
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
  const result = run("pending", [
    `--plan=${env.plan}`,
    `--head=${HEAD}`,
    `--answers-dir=${answersDir}`,
    `--root=${env.root}`,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

export const pendingCli = { HEAD, pendingOf, place, run, setup };
