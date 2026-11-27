// Records the completion evidence of a ticket with no structured handoff: a legacy ticket delivered
// before the structured handoff existed (record-legacy), or an ordinary-path ticket (record-ordinary).
// The record holds pullRequest, mergeCommit, trustedHeadSha, requiredChecks ("pass"), pendingRows
// (empty) and the kind's flag, legacy: true or ordinary: true. Both refuse any ticket that carries a
// structured record or handoff, so the structured path stays the only way to record a ticket that has
// one. Reads run before the single write.
import { FULL_SHA, upsertRecord } from "./closure-completion.mjs";
import { gh, readComments } from "./closure-github.mjs";
import { unstructuredRefusals } from "./closure-legacy-refusals.mjs";
import { renderCompletionRecord } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";
import { readMergedRequiredChecks } from "./required-checks.mjs";
import { guardedRunner } from "./snapshot-runner.mjs";

const KINDS = new Set(["legacy", "ordinary"]);

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

function recordUnstructuredDelivery({ kind, repository, pull, issue, runner }) {
  if (!KINDS.has(kind)) {
    throw new TypeError(`unknown delivery kind ${kind}`);
  }
  if (!(isPositiveInteger(pull) && isPositiveInteger(issue))) {
    throw new ClosureStop(`record-${kind} needs positive integer --pull and --issue`, {});
  }
  const live = readLive({ runner, repository, pull, issue });
  const reasons = unstructuredRefusals(live, kind);
  if (reasons.length > 0) {
    throw new ClosureStop(`${kind} delivery refused: ${reasons.join("; ")}`, { issue, pull, reasons });
  }
  const body = renderCompletionRecord({
    pullRequest: pull,
    mergeCommit: live.pull.merge_commit_sha,
    trustedHeadSha: live.pull.head.sha,
    requiredChecks: "pass",
    pendingRows: [],
    [kind]: true,
  });
  return { records: [upsertRecord({ runner, repository }, issue, body)], [kind]: true };
}

function recordLegacyDelivery(request) {
  return recordUnstructuredDelivery({ ...request, kind: "legacy" });
}

function recordOrdinaryDelivery(request) {
  return recordUnstructuredDelivery({ ...request, kind: "ordinary" });
}

export { recordLegacyDelivery, recordOrdinaryDelivery };
