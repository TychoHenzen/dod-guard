import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cli } from "./review-batch-cli.test-support.mjs";

const { HEAD, PLAN, readJson } = cli;

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

// A checkout holding the one file, a.mjs, that the answers cite.
function checkout(dir) {
  const root = path.join(dir, "checkout");
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "a.mjs"), "one\ntwo\nthree\n");
  return root;
}

function answerFlags(dir, out = path.join(dir, "answers.json")) {
  return [
    `--plan=${PLAN}`,
    `--head=${HEAD}`,
    `--answers-dir=${path.join(dir, "answers")}`,
    `--root=${checkout(dir)}`,
    `--out=${out}`,
  ];
}

export const answerHelpers = { answerFlags, answeredFor, answersDir, checkout, writeAllAnswers };
