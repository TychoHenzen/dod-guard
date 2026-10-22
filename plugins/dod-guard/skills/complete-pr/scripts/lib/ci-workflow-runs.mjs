// Validates the list of ci.yml runs GitHub returns for one head.
import { stop } from "./completion-error.mjs";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

function duplicateRunRecovery(headSha) {
  return [
    "Do not dispatch again. Rerun only the failed jobs of the existing run with:",
    "gh run rerun <run-id> --failed",
    `(list runs with: gh run list --workflow ci.yml --commit ${headSha}).`,
    "Then rerun complete-pr.",
  ].join(" ");
}

function hasRunEvent(run) {
  return Boolean(run) && typeof run === "object" && typeof run.event === "string" && run.event.length > 0;
}

function requireRunEvent(run, headSha) {
  if (!hasRunEvent(run)) {
    stop("unknown_ci_workflow_state", `GitHub returned an invalid ci.yml run event for ${headSha}.`);
  }
}

function requireNewRunEvent(runsByEvent, run, headSha) {
  if (runsByEvent.has(run.event)) {
    stop(
      "duplicate_ci_workflow_run",
      `Found multiple ci.yml runs for ${headSha} and event ${run.event}.`,
      duplicateRunRecovery(headSha),
    );
  }
}

function requireCiWorkflowRun(runs, headSha) {
  if (!Array.isArray(runs)) {
    stop("unknown_ci_workflow_state", `GitHub returned an invalid run list for ${headSha}.`);
  }
  if (runs.length === 0) {
    return null;
  }

  const runsByEvent = new Map();
  for (const run of runs) {
    requireRunEvent(run, headSha);
    requireNewRunEvent(runsByEvent, run, headSha);
    runsByEvent.set(run.event, requireExactCiWorkflowRun(run, headSha));
  }

  return [...runsByEvent.values()];
}

function requireExactCiWorkflowRun(run, headSha) {
  if (!run || typeof run !== "object") {
    stop("unknown_ci_workflow_state", `GitHub returned an invalid ci.yml run for ${headSha}.`);
  }
  requireMatchingCiHead(run, headSha);
  requireCiWorkflowPath(run);

  return run;
}

function requireMatchingCiHead(run, headSha) {
  if (run.head_sha !== headSha) {
    const reportedHead = run.head_sha ?? "<missing>";
    stop("stale_ci_workflow_run", `The ci.yml run reports ${reportedHead}, not trusted head ${headSha}.`);
  }
}

function isCiWorkflowPath(path) {
  return typeof path === "string" && (path === CI_WORKFLOW_PATH || path.startsWith(`${CI_WORKFLOW_PATH}@`));
}

function requireCiWorkflowPath(run) {
  if (!isCiWorkflowPath(run.path)) {
    const workflowPath = run.path ?? "workflow path missing";
    stop("unrelated_ci_workflow_run", `The exact-head Actions run is not ci.yml (${workflowPath}).`);
  }
}

export { requireCiWorkflowRun };
