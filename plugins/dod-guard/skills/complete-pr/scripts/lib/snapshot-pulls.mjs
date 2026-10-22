import { isRepositoryName } from "../../../../lib/repository-identity.mjs";
import { sameRepository } from "./project-reads.mjs";
import { readMergedRequiredChecks } from "./required-checks.mjs";
import { atEndpoint, readFailure } from "./snapshot-failure.mjs";
import { pullReference } from "./snapshot-pull-reference.mjs";
import { nonBlank } from "./snapshot-values.mjs";

// A pull request is merged once GitHub gives it a merge time. GitHub also fills merge_commit_sha on an
// open pull request with a test-merge commit, so only the merge time decides whether a merge commit exists.
function isMerged(pull) {
  return nonBlank(pull.merged_at);
}

function mergeCommitOf(pull) {
  if (isMerged(pull) && nonBlank(pull.merge_commit_sha)) {
    return { oid: pull.merge_commit_sha };
  }
  return null;
}

// The merge time of a merged pull request, or null, so mergedAt agrees with the merge commit and checks.
function mergedAtOf(pull) {
  if (isMerged(pull)) {
    return pull.merged_at;
  }
  return null;
}

// Only a merged pull request has required checks to read; an open one has none to satisfy yet.
// The merged reader drops a currently required check that never ran on the head, so a check
// added to branch protection later does not fail an older delivery.
function requiredChecksOf(pull, { repository, head, base, read }) {
  if (!isMerged(pull)) {
    return null;
  }
  return atEndpoint(`repos/${repository}/commits/${head.sha}`, () =>
    readMergedRequiredChecks(repository, { baseBranch: base.ref, headSha: head.sha }, read),
  );
}

function headOf(pull, number, endpoint) {
  const repository = pull.head?.repo?.full_name ?? null;
  if (repository !== null && !isRepositoryName(repository)) {
    throw readFailure(endpoint, `pull request #${number} head repository names no repository`);
  }
  return { repository, ref: pull.head?.ref, sha: pull.head?.sha };
}

// One target pull request, from the full REST pull request object its Project item links.
function pullRequestRecord(pull, { repository, number, endpoint, read }) {
  const head = headOf(pull, number, endpoint);
  const base = { ref: pull.base?.ref, sha: pull.base?.sha };
  if (![pull.state, head.ref, head.sha, base.ref, base.sha].every(nonBlank)) {
    throw readFailure(endpoint, `pull request #${number} must carry a state, head and base refs, and SHAs`);
  }
  return {
    number,
    repository,
    state: pull.state,
    mergedAt: mergedAtOf(pull),
    head,
    base,
    mergeCommit: mergeCommitOf(pull),
    requiredChecks: requiredChecksOf(pull, { repository, head, base, read }),
  };
}

const pullKey = (reference) => `${reference.repository.toLowerCase()}#${reference.number}`;

function collectItemPulls(records, { item, pulls }, context) {
  for (const pull of pulls) {
    const reference = pullReference(pull, { subject: `item ${item.id}`, endpoint: context.endpoint });
    const key = pullKey(reference);
    if (sameRepository(reference.repository, context.repository) && !records.has(key)) {
      records.set(key, pullRequestRecord(pull, { ...context, number: reference.number }));
    }
  }
}

// The target pull requests the target items link, each once, in Project order. A linked pull request
// from another repository is a relation the planner reports, not a record the snapshot lists.
export function pullRequestRecords(targets, context) {
  const records = new Map();
  for (const target of targets) {
    collectItemPulls(records, target, context);
  }
  return [...records.values()];
}
