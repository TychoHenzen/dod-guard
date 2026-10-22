import { sameRepository } from "./project-reads.mjs";
import { readFailure, readPages } from "./snapshot-failure.mjs";
import { isObject, nonBlank } from "./snapshot-values.mjs";

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

function readOpenHeads(read, repository) {
  const endpoint = `repos/${repository}/pulls?state=open&per_page=100`;
  return readPages(read, endpoint).map((pull) => {
    if (!isObject(pull) || !nonBlank(pull.head?.ref)) {
      throw readFailure(endpoint, "every open pull request must carry a head ref");
    }
    return { ref: pull.head.ref, repository: pull.head.repo?.full_name ?? null };
  });
}

// Every pushed codex/ branch of the target repository, with whether an open pull request of that same
// repository has it as its head. A pull request from a fork that reuses the branch name does not count.
// The classifier holds a Todo or Backlog root whose branch has no open pull request.
export function branchRecords(read, repository) {
  const names = readBranchNames(read, repository);
  const heads = readOpenHeads(read, repository);
  return names.map((name) => ({
    name,
    openPullRequest: heads.some((head) => head.ref === name && sameRepository(head.repository, repository)),
  }));
}
