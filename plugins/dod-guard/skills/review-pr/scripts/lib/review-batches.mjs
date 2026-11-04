import { batchDocuments, batchName, cutBatches } from "./batch-cut.mjs";
import { batchProblems } from "./batch-problems.mjs";
import { planHash } from "./plan-hash.mjs";

// files maps each batch name to its parsed answers file or a problem string.
function mergeAnswers({ plan, headSha, files }) {
  const hash = planHash(plan);
  const batches = batchDocuments(plan, headSha);
  const problems = batches.flatMap((batch) => batchProblems({ batch, doc: files.get(batch.batch), hash, headSha }));
  if (problems.length > 0) {
    throw new Error(`Answers refused:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }
  return {
    planHash: hash,
    headSha,
    answers: batches.flatMap((batch) => files.get(batch.batch).answers),
  };
}

function staleStamp(field, got, want) {
  return new Error(`Answers file is stale: ${field} ${JSON.stringify(got ?? null)} does not match ${want}`);
}

// The merged answers file must come from this plan, and from this head when the
// caller knows the head.
function requireFreshAnswers(answers, plan, headSha) {
  const expected = planHash(plan);
  if (answers?.planHash !== expected) {
    throw staleStamp("planHash", answers?.planHash, `the plan's ${expected}`);
  }
  if (headSha !== undefined && answers.headSha !== headSha) {
    throw staleStamp("headSha", answers.headSha, headSha);
  }
}

export { batchDocuments, batchName, cutBatches, mergeAnswers, planHash, requireFreshAnswers };
