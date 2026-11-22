import { sameRepository } from "./project-reads.mjs";
import { readFailure, readPages } from "./snapshot-failure.mjs";
import { isObject, nonBlank, positiveInteger } from "./snapshot-values.mjs";

const HEADS = "refs/heads/";

function readBranchNames(read, repository) {
  const endpoint = `repos/${repository}/git/matching-refs/heads/codex/?per_page=100`;
  return readPages(read, endpoint).map((entry) => {
    if (!isObject(entry) || !nonBlank(entry.ref) || !entry.ref.startsWith(HEADS)) {
      throw readFailure(endpoint, "every branch must carry a ref under refs/heads/");
    }
    return entry.ref.slice(HEADS.length);
  });
}

// Every open pull request of the target repository, read once by the caller and shared by the branch
// records and the unlinked-pull-request list.
export function readOpenPulls(read, repository) {
  const endpoint = `repos/${repository}/pulls?state=open&per_page=100`;
  return readPages(read, endpoint).map((pull) => {
    if (!isObject(pull) || !nonBlank(pull.head?.ref)) {
      throw readFailure(endpoint, "every open pull request must carry a head ref");
    }
    if (!positiveInteger(pull.number)) {
      throw readFailure(endpoint, "every open pull request must carry a positive integer number");
    }
    return { number: pull.number, headRef: pull.head.ref, headRepository: pull.head.repo?.full_name ?? null };
  });
}

// Every pushed codex/ branch of the target repository, with whether an open pull request of that same
// repository has it as its head. The open pull requests are passed in, read once by the caller. A pull
// request from a fork that reuses the branch name does not count. The classifier holds a Todo or Backlog
// root whose branch has no open pull request.
export function branchRecords(read, repository, openPulls) {
  const names = readBranchNames(read, repository);
  return names.map((name) => ({
    name,
    openPullRequest: openPulls.some((pull) => pull.headRef === name && sameRepository(pull.headRepository, repository)),
  }));
}
