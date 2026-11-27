// The refusals record-legacy makes about the merged pull request itself. Each check is one named
// predicate over the live read, so a new refusal is a new table row and not a deeper branch.
import { sameRepository } from "../../../../lib/repository-identity.mjs";
import { FULL_SHA } from "./closure-completion.mjs";
import { closingReferences } from "./linked-issues.mjs";

function isFullSha(value) {
  return FULL_SHA.test(value ?? "");
}

function lacksMergeEvidence({ pull }) {
  return !(isFullSha(pull.merge_commit_sha) && isFullSha(pull.head?.sha));
}

function lacksClosingKeyword({ pull, repository, issueNumber }) {
  return !closingReferences(pull.body, repository).some(
    (reference) => reference.number === issueNumber && sameRepository(reference.repository, repository),
  );
}

// Each row is the text after "pull request #N" ({issue} stands for the issue number) and the test
// that makes the row a refusal. ordinary-proof.mjs applies the target rows before the merge too.
const TARGET_CHECKS = [
  ["base is not the default branch", ({ pull, defaultBranch }) => pull.base?.ref !== defaultBranch],
  [
    "head repository is not the target repository",
    ({ pull, repository }) => !sameRepository(pull.head?.repo?.full_name, repository),
  ],
];

const PULL_CHECKS = [
  ["is not merged", ({ pull }) => !pull.merged_at],
  ["merge commit or head is missing", lacksMergeEvidence],
  ...TARGET_CHECKS,
  ["body has no closing keyword for #{issue}", lacksClosingKeyword],
];

function pullReasons(live) {
  return PULL_CHECKS.filter(([, refused]) => refused(live)).map(
    ([tail]) => `pull request #${live.pullNumber} ${tail.replace("{issue}", live.issueNumber)}`,
  );
}

export { pullReasons, TARGET_CHECKS };
