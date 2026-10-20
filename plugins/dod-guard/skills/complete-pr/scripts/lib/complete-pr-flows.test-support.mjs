// Flow fixtures shared by the complete-pr test files: convergence calls, merging pull sequences, and REST readers.
import { protectedRequiredChecks, pull, restChecksReader } from "./complete-pr.test-support.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";

// Converges a ready pull request at headSha on head-2 with a zero-delay poll of headPollLimit reads.
export function convergeAt(client, headSha, headPollLimit) {
  return waitForHeadConvergence(client, {
    expectedHead: "head-2",
    initialPullRequest: pull({ headSha, isDraft: false }),
    options: { headPollLimit, pollMs: 0 },
    repository: client.repositoryDetails,
  });
}

// The pull request reads of a merge loop: a draft, three ready reads, then the read that shows the merge.
export function mergingPulls(state) {
  return [
    pull(),
    ...Array.from({ length: 3 }, () => pull({ isDraft: false })),
    pull({ isDraft: false, mergeCommitSha: "merge-1", state }),
  ];
}

// A required-check reader over a protected base branch whose check runs are the given list.
export function protectedRestReader(checkRuns) {
  return restChecksReader({ protection: protectedRequiredChecks(), checkRuns });
}
