// The closing-issue checks before and after the merge.
import { stop } from "./completion-error.mjs";

const NO_LINKED_ISSUE_NOTE =
  " A pull request deliberately opened without a backlog issue can pass --no-linked-issue instead.";

function missingClosingIssueMessage(pullNumber) {
  return (
    `Pull request #${pullNumber} has no closing issue reference. complete-pr cannot finish a partial delivery. ` +
    'Add "Closes #<parent>" to the pull request body, or split the undelivered scope into its own issue ' +
    `and narrow the parent so this pull request delivers all of it.${NO_LINKED_ISSUE_NOTE}`
  );
}

// A merge cannot be undone, so a pull request that closes no issue must stop before the first mutation,
// unless the caller said this pull request has no issue to close.
async function requireClosingIssue(client, pullNumber, options = {}) {
  if (options.noLinkedIssue) {
    return;
  }
  const issues = await client.getLinkedIssues(pullNumber);
  if (issues.length === 0) {
    stop("missing_linked_issue", missingClosingIssueMessage(pullNumber));
  }
}

// Returns the closed linked issues, or none when the caller said the pull request has no issue to close.
async function confirmClosedIssues(client, pullNumber, options) {
  for (let attempt = 0; attempt < options.issuePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Linked issue closure is eventually consistent after merge.
    const issues = await client.getLinkedIssues(pullNumber);
    if (issues.length === 0) {
      if (options.noLinkedIssue) {
        return [];
      }
      stop("missing_linked_issue", `The merged pull request has no closing issue reference.${NO_LINKED_ISSUE_NOTE}`);
    }
    if (issues.every((issue) => issue.state === "CLOSED")) {
      return issues;
    }
    await client.wait(options.pollMs);
  }

  stop("linked_issue_open", "A linked closing issue remained open after the pull request merged.");
}

export { confirmClosedIssues, requireClosingIssue };
