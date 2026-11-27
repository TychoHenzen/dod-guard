// The three proofs behind handoff-proof.mjs, with no file access. Each takes
// { body, handoff, headSha, children, plans } and returns { outcome, remainder }.
// Only refinement reads plans, the step plans' proxy checks run over the checkout.
// finalization requires the handoff's ## Preflight checkpoint and fails on any
// required context that is not present or skipped at the head; post-push checks
// the rows only when the record exists. Both join the handoff's matrix rows to
// the body's planned rows by id before the matrix is evaluated.
import { godotWindowRemainder } from "../../../lib/godot-window-rows.mjs";
import { bodyLimitProblems, HANDOFF_LIMITS, lineProblem } from "../../../lib/handoff-limits.mjs";
import { joinPlannedRows, readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { postPushInput } from "../../../lib/post-push-input.mjs";
import { checkpointRemainder, checkpointSection, readPreflightCheckpoint } from "../../../lib/preflight-checkpoint.mjs";
import { proxyRemainder } from "../../../lib/step-plan-proxy.mjs";
import { evaluateStructuredFinalization } from "../../complete-pr/scripts/finalization-gate.mjs";
import { evaluateConvergence } from "./structured-workflow-proof.mjs";

function outcomeOf(remainder) {
  return { outcome: remainder.length === 0 ? "verified" : "actionable remainder", remainder };
}

// Parse errors stop before evaluation, and acceptance-id disagreements join the
// convergence remainder. Requirement-id disagreements, a head stored in a
// lens-ownership entry and a body over the handoff's limits join the remainder in
// this proof only, and so does a Godot row that asks for a window, so post-push
// and finalization never see them.
function refinementProof({ body, children, plans = [], godot = false }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) return { outcome: "parse error", remainder: parsed.errors };
  const convergence = evaluateConvergence({ ...parsed.input, children });
  return outcomeOf([
    ...parsed.remainder,
    ...parsed.requirementRemainder,
    ...parsed.lensHeadRemainder,
    ...bodyLimitProblems(parsed.input),
    ...convergence.remainder,
    ...proxyRemainder(plans),
    ...(godot ? godotWindowRemainder(parsed.input.plannedAcceptanceMatrix) : []),
  ]);
}

// The record is written after the draft PR, so post-push passes a handoff with no
// record and checks only the rows of a record that exists. Finalization requires it.
function checkpointProblems({ handoff, headSha, required }) {
  const read = readPreflightCheckpoint(handoff);
  if (read.absent) return required ? ["handoff has no ## Preflight checkpoint section"] : [];
  if (read.error) return [read.error];
  const { section } = checkpointSection(handoff);
  const size = lineProblem("the ## Preflight checkpoint section", section, HANDOFF_LIMITS.checkpoint);
  return [...(size ? [size] : []), ...checkpointRemainder(read.rows, headSha)];
}

// The post-push input: the observed rows, joined to their planned rows, and the
// pushed head replace the planned matrix. A body or handoff that cannot be read
// stops with a failure result before any evaluation runs; a row the join cannot
// place is a remainder entry.
function assembleInput({ body, handoff, headSha, children }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) {
    return { failure: { outcome: "parse error", remainder: parsed.errors } };
  }
  const matrix = readHandoffMatrix(handoff);
  if (matrix.error) {
    return { failure: { outcome: "parse error", remainder: [matrix.error] } };
  }
  const joined = joinPlannedRows(matrix, parsed.input.plannedAcceptanceMatrix);
  const input = postPushInput({ input: parsed.input, rows: joined.rows, headSha });
  return { parsed, input: { ...input, children }, joinRemainder: joined.problems };
}

function postPushProof(request) {
  const assembled = assembleInput(request);
  if (assembled.failure) {
    return assembled.failure;
  }
  const convergence = evaluateConvergence(assembled.input);
  return outcomeOf([
    ...assembled.parsed.remainder,
    ...assembled.joinRemainder,
    ...convergence.remainder,
    ...checkpointProblems({ handoff: request.handoff, headSha: request.headSha, required: false }),
  ]);
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
  const remainder = [...assembled.parsed.remainder, ...assembled.joinRemainder, ...result.remainder];
  remainder.push(...checkpointProblems({ handoff: request.handoff, headSha: request.headSha, required: true }));
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
