// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { join } from "node:path";
import { readJsonFile } from "../../../../lib/read-text.mjs";
import { batchProblems } from "./batch-problems.mjs";
import { requireDraftPlan } from "./draft-plan.mjs";
import { batchDocuments, mergeAnswers, planHash } from "./review-batches.mjs";

function planArray(path) {
  const plan = readJsonFile(path);
  if (!Array.isArray(plan)) {
    throw new Error(`The review plan in ${path} must be a JSON array`);
  }
  return plan;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Cuts the saved plan into the batch files the investigators read, after the
// same shape check the build applies, so a malformed plan fails before any
// investigator runs.
function batches(args) {
  const plan = planArray(args.plan);
  requireDraftPlan(plan);
  mkdirSync(args["out-dir"], { recursive: true });
  const written = batchDocuments(plan, args.head).map((doc) => {
    const file = join(args["out-dir"], `${doc.batch}.json`);
    writeJson(file, doc);
    return { batch: doc.batch, file, questions: doc.questions.length };
  });
  return { planHash: planHash(plan), batches: written };
}

function loadAnswerFile(dir, batch) {
  const file = join(dir, `${batch}.json`);
  if (!existsSync(file)) {
    return `answers file ${file} is missing`;
  }
  try {
    return readJsonFile(file);
  } catch (error) {
    return error.message;
  }
}

// Regenerates the batches from the plan instead of reading the batch files, so
// a stale batch file on disk cannot make a stale answers file look current.
function answers(args) {
  const plan = planArray(args.plan);
  const files = new Map(
    batchDocuments(plan, args.head).map(({ batch }) => [batch, loadAnswerFile(args["answers-dir"], batch)]),
  );
  const merged = mergeAnswers({ plan, headSha: args.head, files });
  writeJson(args.out, merged);
  const count = (status) => merged.answers.filter((answer) => answer.status === status).length;
  return { out: args.out, answered: count("answered"), unanswered: count("unanswered") };
}

// Reads the answers directory without writing anything and sorts every batch into done or pending. A batch is done
// only when its file passes the same checks `answers` applies, so a missing, truncated, stale or short file is pending.
function pending(args) {
  const plan = planArray(args.plan);
  const hash = planHash(plan);
  const states = batchDocuments(plan, args.head).map((batch) => {
    const doc = loadAnswerFile(args["answers-dir"], batch.batch);
    return { batch, problems: batchProblems({ batch, doc, hash, headSha: args.head }) };
  });
  return {
    planHash: hash,
    done: states.filter(({ problems }) => problems.length === 0).map(({ batch }) => batch.batch),
    pending: states
      .filter(({ problems }) => problems.length > 0)
      .map(({ batch, problems }) => ({ batch: batch.batch, questions: batch.questions.length, problems })),
  };
}

export { answers, batches, pending };
