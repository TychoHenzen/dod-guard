import { planHash } from "./plan-hash.mjs";

const BATCH_SIZE = 8;

function batchName(index) {
  return `b${String(index + 1).padStart(2, "0")}`;
}

// One slot's questions, cut into chunks of at most BATCH_SIZE.
function chunksOf(entry) {
  const asked = (entry.questions ?? []).map((q) => ({
    slot: entry.slot,
    id: q.id,
    question: q.question,
    files: q.files,
  }));
  const chunks = [];
  for (let start = 0; start < asked.length; start += BATCH_SIZE) {
    chunks.push(asked.slice(start, start + BATCH_SIZE));
  }
  return chunks;
}

// A slot's questions stay in one batch unless the slot alone passes the cap.
function cutBatches(plan) {
  const batches = [];
  let current = [];
  for (const chunk of plan.flatMap(chunksOf)) {
    if (current.length + chunk.length > BATCH_SIZE) {
      batches.push(current);
      current = [];
    }
    current.push(...chunk);
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

export { batchDocuments, batchName, cutBatches };
