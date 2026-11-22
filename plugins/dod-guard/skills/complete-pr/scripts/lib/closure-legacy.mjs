// Records the completion evidence of a ticket delivered before the structured handoff existed. The
// record holds pullRequest, mergeCommit, trustedHeadSha, requiredChecks ("pass"), pendingRows (empty)
// and legacy: true. It refuses any ticket that carries a structured record or handoff, so the
// structured path stays the only way to record a ticket that has one. Reads run before the single write.
import { FULL_SHA, upsertRecord } from "./closure-completion.mjs";
import { gh, readComments } from "./closure-github.mjs";
import { legacyRefusals } from "./closure-legacy-refusals.mjs";
import { renderCompletionRecord } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";
import { readMergedRequiredChecks } from "./required-checks.mjs";
import { guardedRunner } from "./snapshot-runner.mjs";

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// The required checks are read only for a merged pull request, because an unmerged one is already
// refused by the merge check.
function readChecks(runner, repository, pull) {
  if (!(pull?.merged_at && FULL_SHA.test(pull.head?.sha ?? ""))) {
    return null;
  }
  const target = { baseBranch: pull.base?.ref, headSha: pull.head.sha };
  return readMergedRequiredChecks(repository, target, guardedRunner(runner));
}

function readLive({ runner, repository, pull, issue }) {
  const pullRecord = gh(runner, ["api", `repos/${repository}/pulls/${pull}`]);
  return {
    repository,
    issueNumber: issue,
    pullNumber: pull,
    defaultBranch: gh(runner, ["api", `repos/${repository}`])?.default_branch ?? null,
    pull: pullRecord,
    issue: gh(runner, ["api", `repos/${repository}/issues/${issue}`]),
    comments: readComments({ runner, repository }, issue),
    checks: readChecks(runner, repository, pullRecord),
  };
}

function recordLegacyDelivery({ repository, pull, issue, runner }) {
  if (!(isPositiveInteger(pull) && isPositiveInteger(issue))) {
    throw new ClosureStop("record-legacy needs positive integer --pull and --issue", {});
  }
  const live = readLive({ runner, repository, pull, issue });
  const reasons = legacyRefusals(live);
  if (reasons.length > 0) {
    throw new ClosureStop(`legacy delivery refused: ${reasons.join("; ")}`, { issue, pull, reasons });
  }
  const body = renderCompletionRecord({
    pullRequest: pull,
    mergeCommit: live.pull.merge_commit_sha,
    trustedHeadSha: live.pull.head.sha,
    requiredChecks: "pass",
    pendingRows: [],
    legacy: true,
  });
  return { records: [upsertRecord({ runner, repository }, issue, body)], legacy: true };
}

export { recordLegacyDelivery };
