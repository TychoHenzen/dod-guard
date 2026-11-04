// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { createHash } from "node:crypto";

const BATCH_SIZE = 8;

function compareSlots(left, right) {
  if (left.slot === right.slot) {
    return 0;
  }
  return left.slot < right.slot ? -1 : 1;
}

// The hash covers what the investigators were asked, never the statuses saved
// after verification, so saving a status leaves it unchanged.
function canonicalEntry(entry) {
  const asked = entry.questions?.map((q) => [q.id, q.lens, q.question, q.files]) ?? null;
  const excluded = entry.excluded ? [entry.excluded.lens, entry.excluded.reason] : null;
  return [entry.slot, asked, excluded];
}

function planHash(plan) {
  const entries = [...plan].sort(compareSlots).map(canonicalEntry);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 16);
}

function batchName(index) {
  return `b${String(index + 1).padStart(2, "0")}`;
}

// A slot's questions stay in one batch unless the slot alone passes the cap.
function cutBatches(plan) {
  const batches = [];
  let current = [];
  for (const entry of plan) {
    const asked = (entry.questions ?? []).map((q) => ({
      slot: entry.slot,
      id: q.id,
      question: q.question,
      files: q.files,
    }));
    for (let start = 0; start < asked.length; start += BATCH_SIZE) {
      const chunk = asked.slice(start, start + BATCH_SIZE);
      if (current.length + chunk.length > BATCH_SIZE) {
        batches.push(current);
        current = [];
      }
      current.push(...chunk);
    }
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function batchDocuments(plan, headSha) {
  const hash = planHash(plan);
  return cutBatches(plan).map((questions, index) => ({
    planHash: hash,
    headSha,
    batch: batchName(index),
    questions,
  }));
}

function present(value) {
  return typeof value === "string" && value.trim() !== "";
}

function answerProblem(answer) {
  if (answer.status === "answered") {
    if (!present(answer.path)) {
      return "answered without a path";
    }
    if (!(Number.isInteger(answer.line) && answer.line > 0)) {
      return "answered without a line above 0";
    }
    return present(answer.fact) ? null : "answered without a fact";
  }
  if (answer.status === "unanswered") {
    return present(answer.searched) ? null : "unanswered without searched";
  }
  return `unknown status ${JSON.stringify(answer.status ?? null)}`;
}

function stampProblems(batch, doc, hash, headSha) {
  return [
    ["planHash", hash],
    ["headSha", headSha],
    ["batch", batch.batch],
  ]
    .filter(([field, want]) => doc[field] !== want)
    .map(([field, want]) => `${field} is ${JSON.stringify(doc[field] ?? null)}, expected ${want}`);
}

function coverageProblems(batch, answers) {
  const problems = [];
  const byId = new Map();
  for (const answer of answers) {
    if (byId.has(answer?.id)) {
      problems.push(`duplicate answer for ${answer.id}`);
    }
    byId.set(answer?.id, answer);
  }
  const wanted = new Set(batch.questions.map((q) => q.id));
  for (const id of byId.keys()) {
    if (!wanted.has(id)) {
      problems.push(`answer for ${JSON.stringify(id ?? null)} is not a question of this batch`);
    }
  }
  for (const question of batch.questions) {
    const answer = byId.get(question.id);
    if (!answer) {
      problems.push(`missing answer for ${question.id}`);
      continue;
    }
    if (answer.slot !== question.slot) {
      problems.push(`${question.id} names slot ${JSON.stringify(answer.slot ?? null)}, expected ${question.slot}`);
    }
    const problem = answerProblem(answer);
    if (problem) {
      problems.push(`${question.id}: ${problem}`);
    }
  }
  return problems;
}

// `doc` is the parsed answers file, or a string that says why it could not be
// read.
function batchProblems(batch, doc, hash, headSha) {
  if (typeof doc === "string") {
    return [`${batch.batch}: ${doc}`];
  }
  if (doc === null || typeof doc !== "object" || !Array.isArray(doc.answers)) {
    return [`${batch.batch}: the file must be an object with an answers array`];
  }
  const problems = [...stampProblems(batch, doc, hash, headSha), ...coverageProblems(batch, doc.answers)];
  return problems.map((problem) => `${batch.batch}: ${problem}`);
}

// files maps each batch name to its parsed answers file or a problem string.
function mergeAnswers({ plan, headSha, files }) {
  const hash = planHash(plan);
  const batches = batchDocuments(plan, headSha);
  const problems = batches.flatMap((batch) => batchProblems(batch, files.get(batch.batch), hash, headSha));
  if (problems.length > 0) {
    throw new Error(`Answers refused:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }
  return {
    planHash: hash,
    headSha,
    answers: batches.flatMap((batch) => files.get(batch.batch).answers),
  };
}

// The merged answers file must come from this plan, and from this head when the
// caller knows the head.
function requireFreshAnswers(answers, plan, headSha) {
  const expected = planHash(plan);
  if (answers?.planHash !== expected) {
    throw new Error(
      `Answers file is stale: planHash ${JSON.stringify(answers?.planHash ?? null)} does not match the plan's ${expected}`,
    );
  }
  if (headSha !== undefined && answers.headSha !== headSha) {
    throw new Error(
      `Answers file is stale: headSha ${JSON.stringify(answers.headSha ?? null)} does not match ${headSha}`,
    );
  }
}

export { batchDocuments, batchName, cutBatches, mergeAnswers, planHash, requireFreshAnswers };
