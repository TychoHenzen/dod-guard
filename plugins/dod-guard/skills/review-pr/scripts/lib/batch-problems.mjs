import { coverageProblems } from "./answer-problems.mjs";

function stampProblems(doc, expected) {
  return Object.entries(expected)
    .filter(([field, want]) => doc[field] !== want)
    .map(([field, want]) => `${field} is ${JSON.stringify(doc[field] ?? null)}, expected ${want}`);
}

// `doc` is the parsed answers file, or a string that says why it could not be
// read.
function batchProblems({ batch, doc, hash, headSha }) {
  if (typeof doc === "string") {
    return [`${batch.batch}: ${doc}`];
  }
  if (doc === null || typeof doc !== "object" || !Array.isArray(doc.answers)) {
    return [`${batch.batch}: the file must be an object with an answers array`];
  }
  const stamp = { planHash: hash, headSha, batch: batch.batch };
  const problems = [...stampProblems(doc, stamp), ...coverageProblems(batch, doc.answers)];
  return problems.map((problem) => `${batch.batch}: ${problem}`);
}

export { batchProblems };
