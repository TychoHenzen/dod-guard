// Git refs and commits of one repository, read and written over REST.
import { ghJson, githubResponseContractError, isHttpNotFound } from "./gh-runner.mjs";

export function encodeBranch(branchName) {
  return branchName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function readBranchRef(repository, branchName, commandRunner) {
  const encodedBranch = encodeBranch(branchName);
  const { data, result } = ghJson(["api", `repos/${repository}/git/ref/heads/${encodedBranch}`], [0, 1], commandRunner);
  if (isHttpNotFound(result)) {
    return null;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Failed to read remote branch ref.");
  }
  if (!isNonEmptyString(data?.object?.sha)) {
    throw githubResponseContractError(
      `repos/${repository}/git/ref/heads/${encodedBranch}`,
      "a branch ref with a commit SHA",
    );
  }
  return { sha: data.object.sha };
}

export function deleteBranchRef(repository, branchName, commandRunner) {
  const encodedBranch = encodeBranch(branchName);
  commandRunner(["api", "--method", "DELETE", `repos/${repository}/git/refs/heads/${encodedBranch}`]);
}

export function readCommit(repository, sha, commandRunner) {
  const { data } = ghJson(["api", `repos/${repository}/commits/${sha}`], [0], commandRunner);
  return { parents: data.parents.map((parent) => parent.sha), sha: data.sha };
}
