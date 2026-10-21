import { API_ISSUE_URL, urlReference } from "../../../../lib/repository-identity.mjs";
import { readFailure } from "./snapshot-failure.mjs";
import { childrenOf, commentsOf } from "./snapshot-issue-reads.mjs";
import { isNullOrString, nonBlank, positiveInteger, present } from "./snapshot-values.mjs";

const ISSUE_KEYS = ["body", "state_reason"];

function isIssueItem(content) {
  return positiveInteger(content.number) && nonBlank(content.state);
}

function checkIssueShape(content, endpoint) {
  const { number } = content;
  // body and state_reason must be present even when null, because the closure rules read the
  // acceptance criteria and supersedes records from them; an absent key must never read as "no
  // criteria", since that would let a close go through on a guess.
  if (!ISSUE_KEYS.every((key) => key in content)) {
    throw readFailure(endpoint, `issue #${number} content must carry body and state_reason`);
  }
  if (![content.body, content.state_reason].every(isNullOrString)) {
    throw readFailure(endpoint, `issue #${number} body and state_reason must be strings or null`);
  }
}

// ASSUMPTION: REST omits parent_issue_url for an issue that has no parent, so an absent key reads as
// no parent. A present value must still name an issue, so a malformed link fails the build rather
// than reading as no parent.
function issueParent(content, endpoint) {
  checkIssueShape(content, endpoint);
  if (!present(content.parent_issue_url)) {
    return null;
  }
  const parent = urlReference(content.parent_issue_url, API_ISSUE_URL);
  if (parent === null) {
    throw readFailure(endpoint, `issue #${content.number} parent_issue_url must name an issue`);
  }
  return parent;
}

export function issueRecord(content, repository, read) {
  if (!isIssueItem(content)) {
    throw readFailure(`repos/${repository}/issues`, "an issue item must carry a number and a state");
  }
  const { number } = content;
  const target = { repository, number };
  const parent = issueParent(content, `repos/${repository}/issues/${number}`);
  return {
    number,
    repository,
    state: content.state,
    state_reason: content.state_reason,
    title: content.title ?? null,
    body: content.body,
    parent,
    children: childrenOf(content, target, read),
    comments: commentsOf(content, target, read),
  };
}
