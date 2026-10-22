// Folds the exact-head ci.yml runs into one pending or pass state.
import { normalizeCheckRun } from "./check-normalization.mjs";
import { requireCiWorkflowRun } from "./ci-workflow-runs.mjs";
import { stop } from "./completion-error.mjs";

function normalizeCiWorkflowState(run, headSha) {
  return requireCiWorkflowState(normalizeCheckRun({ ...run, name: "ci.yml" }, headSha));
}

function requireCiWorkflowState(check) {
  if (check.bucket === "pending") {
    return "pending";
  }
  if (check.bucket === "fail") {
    stop("ci_workflow_failed", `The exact-head ci.yml run completed with ${check.state}.`);
  }
  if (check.bucket === "pass") {
    return "pass";
  }
  const state = ciWorkflowStateLabel(check);
  stop("unknown_ci_workflow_state", `The exact-head ci.yml run has unsupported state ${state}.`);
}

function ciWorkflowStateLabel(check) {
  return check.state ?? "<missing>";
}

async function readCiWorkflowState(client, headSha) {
  const runs = requireCiWorkflowRun(await client.getCiWorkflowRuns(headSha), headSha);
  if (!runs) {
    return null;
  }

  let sawPendingRun = false;
  for (const run of runs) {
    const state = normalizeCiWorkflowState(run, headSha);
    if (state === "pending") {
      sawPendingRun = true;
    }
  }
  if (sawPendingRun) {
    return "pending";
  }
  return "pass";
}

export { readCiWorkflowState };
