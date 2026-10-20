// Repository settings of one repository, read and written over REST.
import { ghJson } from "./gh-runner.mjs";

export function readRepository(repository, commandRunner) {
  const { data } = ghJson(["api", `repos/${repository}`], [0], commandRunner);
  return {
    autoMergeAllowed: data.allow_auto_merge === true,
    canPush: data.permissions?.push === true,
    defaultBranch: data.default_branch,
    nameWithOwner: data.full_name,
  };
}

export function enableRepositoryAutoMerge(repository, commandRunner) {
  commandRunner(["api", "--method", "PATCH", `repos/${repository}`, "-F", "allow_auto_merge=true"]);
}
