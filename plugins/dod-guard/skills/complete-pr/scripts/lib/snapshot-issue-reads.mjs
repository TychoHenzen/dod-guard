import { API_REPOSITORY_URL, urlRepository } from "../../../../lib/repository-identity.mjs";
import { readFailure, readPages } from "./snapshot-failure.mjs";
import { isObject, positiveInteger } from "./snapshot-values.mjs";

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

// A count of exactly zero is the only skip. A missing count reads, so a childless parent is never
// assumed from an absent count.
export function childrenOf(content, target, read) {
  if (content.sub_issues_summary?.total === 0) {
    return [];
  }
  return readChildren(read, target.repository, target.number);
}

export function commentsOf(content, target, read) {
  if (content.comments === 0) {
    return [];
  }
  return readComments(read, target.repository, target.number);
}
