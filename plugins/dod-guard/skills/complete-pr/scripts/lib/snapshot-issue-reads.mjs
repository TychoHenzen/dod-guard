import { API_REPOSITORY_URL, urlRepository } from "../../../../lib/repository-identity.mjs";
import { readFailure, readPages } from "./snapshot-failure.mjs";
import { isObject, nonBlank, positiveInteger } from "./snapshot-values.mjs";

function isSubIssueEntry(child) {
  const repository = urlRepository(child?.repository_url, API_REPOSITORY_URL);
  return isObject(child) && repository !== null && positiveInteger(child.number);
}

function readChildren(read, repository, number) {
  const endpoint = `repos/${repository}/issues/${number}/sub_issues?per_page=100`;
  return readPages(read, endpoint).map((child) => {
    if (!isSubIssueEntry(child)) {
      throw readFailure(endpoint, "every sub-issue must name its repository_url and number");
    }
    return { repository: urlRepository(child.repository_url, API_REPOSITORY_URL), number: child.number };
  });
}

function isCommentEntry(comment) {
  return isObject(comment) && comment.id !== undefined && comment.id !== null && typeof comment.body === "string";
}

function readComments(read, repository, number) {
  const endpoint = `repos/${repository}/issues/${number}/comments?per_page=100`;
  return readPages(read, endpoint).map((comment) => {
    if (!isCommentEntry(comment)) {
      throw readFailure(endpoint, "every comment must carry an id and a string body");
    }
    return { id: comment.id, body: comment.body };
  });
}

function isBlockerEntry(blocker) {
  const repository = urlRepository(blocker?.repository_url, API_REPOSITORY_URL);
  return isObject(blocker) && repository !== null && positiveInteger(blocker.number) && nonBlank(blocker.state);
}

function readBlockedBy(read, repository, number) {
  const endpoint = `repos/${repository}/issues/${number}/dependencies/blocked_by?per_page=100`;
  return readPages(read, endpoint).map((blocker) => {
    if (!isBlockerEntry(blocker)) {
      throw readFailure(endpoint, "every blocker must name its repository_url, number, and state");
    }
    return {
      repository: urlRepository(blocker.repository_url, API_REPOSITORY_URL),
      number: blocker.number,
      state: blocker.state,
    };
  });
}

// A count of exactly zero is the only skip. A missing count reads, so a childless parent is never
// assumed from an absent count.
export function childrenOf(content, target, read) {
  if (content.sub_issues_summary?.total === 0) {
    return [];
  }
  return readChildren(read, target.repository, target.number);
}

// A closed issue is never a queue candidate, so its blockers are not read. For an open issue a count of
// exactly zero is the only skip, so an absent summary reads the list and never assumes "unblocked".
export function blockedByOf(content, target, read) {
  if (content.state === "closed" || content.issue_dependencies_summary?.total_blocked_by === 0) {
    return [];
  }
  return readBlockedBy(read, target.repository, target.number);
}

export function commentsOf(content, target, read) {
  if (content.comments === 0) {
    return [];
  }
  return readComments(read, target.repository, target.number);
}
