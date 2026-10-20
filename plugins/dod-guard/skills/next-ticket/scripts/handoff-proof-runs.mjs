// The three proofs behind handoff-proof.mjs, with no file access. Each takes
// { body, handoff, headSha, children } and returns { outcome, remainder }.
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords, postPushInput } from "../../../lib/issue-body-records.mjs";
import { evaluateStructuredFinalization } from "../../complete-pr/scripts/finalization-gate.mjs";
import { evaluateConvergence } from "./structured-workflow-proof.mjs";

function outcomeOf(remainder) {
  return { outcome: remainder.length === 0 ? "verified" : "actionable remainder", remainder };
}

// Parse errors stop before evaluation, and acceptance-id disagreements join the
// convergence remainder.
function refinementProof({ body, children }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) return { outcome: "parse error", remainder: parsed.errors };
  const convergence = evaluateConvergence({ ...parsed.input, children });
  return outcomeOf([...parsed.remainder, ...convergence.remainder]);
}

// The post-push input: the observed rows and the pushed head replace the
// planned matrix. A body or handoff that cannot be read stops with a failure
// result before any evaluation runs.
function assembleInput({ body, handoff, headSha, children }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) {
    return { failure: { outcome: "parse error", remainder: parsed.errors } };
  }
  const matrix = readHandoffMatrix(handoff);
  if (matrix.error) {
    return { failure: { outcome: "parse error", remainder: [matrix.error] } };
  }
  const input = postPushInput({ input: parsed.input, rows: matrix.rows, headSha });
  return { parsed, input: { ...input, children } };
}

function postPushProof(request) {
  const assembled = assembleInput(request);
  if (assembled.failure) {
    return assembled.failure;
  }
  const convergence = evaluateConvergence(assembled.input);
  return outcomeOf([...assembled.parsed.remainder, ...convergence.remainder]);
}

// finalization is the same proof as post-push minus the planned matrix, plus the
// gate's own head check; it is the dry run complete-pr runs before the helper
// readies or merges.
function finalizationProof(request) {
  const assembled = assembleInput(request);
  if (assembled.failure) {
    return assembled.failure;
  }
  const result = evaluateStructuredFinalization(assembled.input);
  const remainder = [...assembled.parsed.remainder, ...result.remainder];
  if (result.outcome !== "verified" && remainder.length === 0) {
    remainder.push(`finalization gate reported ${result.outcome}`);
  }
  return outcomeOf(remainder);
}

const PROOFS = Object.freeze({
  refinement: refinementProof,
  "post-push": postPushProof,
  finalization: finalizationProof,
});

export { PROOFS };
