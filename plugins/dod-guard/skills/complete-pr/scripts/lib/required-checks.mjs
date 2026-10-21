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

function pageStatuses(page) {
  if (Array.isArray(page?.statuses)) {
    return page.statuses;
  }
  return [];
}

function protectionReadError(protectionEndpoint, result) {
  const detail = result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`;
  return new Error(`Failed to read branch protection at ${protectionEndpoint}: ${detail}`);
}

function readCommitStatuses(repository, headSha, commandRunner) {
  const statusEndpoint = `repos/${repository}/commits/${headSha}/status?per_page=100`;
  const statusPages = readNamed("commit statuses", statusEndpoint, () =>
    ghJsonPagesData(statusEndpoint, commandRunner),
  );
  const statusSha = statusPages.map((page) => page?.sha).find(Boolean) ?? null;
  return statusPages.flatMap((page) =>
    pageStatuses(page).map((status) => ({ ...status, sha: status.sha ?? statusSha })),
  );
}

export function readRequiredChecks(repository, pullRequest, commandRunner) {
  const branch = encodeBranch(pullRequest.baseBranch);
  const protectionEndpoint = `repos/${repository}/branches/${branch}/protection/required_status_checks`;
  const protectionResponse = readNamed("branch protection", protectionEndpoint, () =>
    ghJson(["api", protectionEndpoint], [0, 1], commandRunner),
  );
  if (isHttpNotFound(protectionResponse.result)) {
    return [];
  }
  if (protectionResponse.result.status !== 0) {
    throw protectionReadError(protectionEndpoint, protectionResponse.result);
  }
  const protection = protectionResponse.data ?? {};
  const checkRuns = readExactHeadCheckRuns(
    `repos/${repository}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
    commandRunner,
  );
  const statuses = readCommitStatuses(repository, pullRequest.headSha, commandRunner);
  return normalizeRequiredChecks(protection, checkRuns, statuses, pullRequest.headSha);
}

// Judges a merged pull request. Branch protection keeps no history, so the required set read here is
// today's. GitHub refuses a merge until every check required at that moment has passed, so a currently
// required check with no run and no status on the merged head was not required for that merge. Only that
// MISSING state is dropped: failed, pending, stale-head, wrong-provider, and duplicate entries still
// count, and a head with no required check left reads as an empty list. The live merge gate must keep
// calling readRequiredChecks.
export function readMergedRequiredChecks(repository, pullRequest, commandRunner) {
  return readRequiredChecks(repository, pullRequest, commandRunner).filter((check) => check.state !== "MISSING");
}
