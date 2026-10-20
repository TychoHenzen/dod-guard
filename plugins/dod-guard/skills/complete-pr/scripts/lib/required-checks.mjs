import { normalizeRequiredChecks } from "./check-normalization.mjs";
import { errorMessage, ghJson, ghJsonPages, ghJsonPagesData, isHttpNotFound, readNamed } from "./gh-runner.mjs";
import { encodeBranch } from "./git-refs.mjs";

const HTTP_TRANSIENT_SERVER_ERROR = /HTTP 5\d{2}/;

function readExactHeadCheckRuns(endpoint, commandRunner) {
  return readNamed("exact-head check runs", endpoint, () => {
    try {
      return ghJsonPages(endpoint, "check_runs", commandRunner);
    } catch (error) {
      if (!HTTP_TRANSIENT_SERVER_ERROR.test(errorMessage(error))) {
        throw error;
      }
      return ghJsonPages(endpoint, "check_runs", commandRunner);
    }
  });
}

export function readRequiredChecks(repository, pullRequest, commandRunner) {
  const branch = encodeBranch(pullRequest.baseBranch);
  const protectionEndpoint = `repos/${repository}/branches/${branch}/protection/required_status_checks`;
  const protectionResponse = readNamed("branch protection", protectionEndpoint, () =>
    ghJson(["api", protectionEndpoint], [0, 1], commandRunner),
  );
  if (protectionResponse.result.status === 1 && isHttpNotFound(protectionResponse.result)) {
    return [];
  }
  if (protectionResponse.result.status !== 0) {
    const { result } = protectionResponse;
    const detail = result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`;
    throw new Error(`Failed to read branch protection at ${protectionEndpoint}: ${detail}`);
  }
  const protection = protectionResponse.data ?? {};
  const checkRuns = readExactHeadCheckRuns(
    `repos/${repository}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
    commandRunner,
  );
  const statusEndpoint = `repos/${repository}/commits/${pullRequest.headSha}/status?per_page=100`;
  const statusPages = readNamed("commit statuses", statusEndpoint, () =>
    ghJsonPagesData(statusEndpoint, commandRunner),
  );
  const statusSha = statusPages.map((page) => page?.sha).find(Boolean) ?? null;
  const statuses = statusPages.flatMap((page) =>
    (Array.isArray(page?.statuses) ? page.statuses : []).map((status) => ({
      ...status,
      sha: status.sha ?? statusSha,
    })),
  );
  return normalizeRequiredChecks(protection, checkRuns, statuses, pullRequest.headSha);
}
