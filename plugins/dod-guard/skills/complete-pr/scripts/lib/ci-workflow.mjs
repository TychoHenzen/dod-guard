// The ci.yml Actions workflow of one repository: its runs for a head, and a dispatch.
import { ghJsonPages } from "./gh-runner.mjs";

export function readCiWorkflowRuns(repository, headSha, commandRunner) {
  const workflowRunsPath = `repos/${repository}/actions/` + "workflows/ci.yml/runs";
  const query = `?head_sha=${encodeURIComponent(headSha)}&per_page=100`;
  return ghJsonPages(`${workflowRunsPath}${query}`, "workflow_runs", commandRunner);
}

export function dispatchCiWorkflow(repository, branchName, commandRunner) {
  commandRunner([
    "api",
    "--method",
    "POST",
    `repos/${repository}/actions/workflows/ci.yml/dispatches`,
    "-f",
    `ref=${branchName}`,
  ]);
}
