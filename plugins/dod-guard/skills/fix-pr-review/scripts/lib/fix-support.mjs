const AUTHORIZATION_SECRET = /\b(Authorization\s*:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi;
const GITHUB_SECRET = /\b(gh[pousr]_)[A-Za-z0-9_]{8,}\b/g;
const QUERY_SECRET = /([?&](?:access_token|api[_-]?key|pat|sig|token)=)[^&#\s]+/gi;
const ENVIRONMENT_SECRET = /\b((?:GITHUB_TOKEN|GH_TOKEN)\s*=\s*)[^\s"']+/gi;
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function section(body, heading) {
  const escaped = heading.replace(REGEX_META, "\\$&");
  return body.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"))?.[1].trim() ?? "";
}

function workItem(child) {
  return { body: child.body ?? "", number: child.number, state: child.state, title: child.title, url: child.url };
}

function subIssues(issue) {
  return issue.subIssues?.nodes ?? issue.subIssues ?? [];
}

function normalizeGitHubHierarchy(issue) {
  const body = issue.body ?? "";
  return {
    acceptanceCriteria: section(body, "Acceptance criteria"),
    body,
    number: issue.number,
    state: issue.state,
    title: issue.title,
    url: issue.url,
    workItems: subIssues(issue).map(workItem),
  };
}

function redactString(value) {
  return value
    .replace(AUTHORIZATION_SECRET, "$1[REDACTED]")
    .replace(GITHUB_SECRET, "$1[REDACTED]")
    .replace(QUERY_SECRET, "$1[REDACTED]")
    .replace(ENVIRONMENT_SECRET, "$1[REDACTED]");
}

function redactSecrets(value) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecrets(item)]));
  }
  return value;
}

function isRestComment(node) {
  return node?.pull_request_review_id !== undefined;
}

function reviewThreadNodes(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap(reviewThreadNodes);
  }
  if (isRestComment(payload)) {
    return [payload];
  }
  if (Array.isArray(payload?.pages)) {
    return payload.pages.flatMap(reviewThreadNodes);
  }
  return payload.data?.repository?.pullRequest?.reviewThreads?.nodes ?? payload.reviewThreads?.nodes ?? payload.reviewThreads ?? [];
}

function threadFinding(thread, comment) {
  return {
    body: comment.body ?? "",
    commentId: comment.databaseId,
    commitSha: comment.commit?.oid,
    file: thread.path,
    id: `GH-${comment.databaseId}`,
    isOutdated: Boolean(thread.isOutdated),
    isResolved: Boolean(thread.isResolved),
    line: thread.line ?? thread.originalLine,
    // Outdated only means later commits moved the anchor; the claim still needs revalidation.
    reviewState: thread.isResolved ? "stale" : "open",
    threadId: thread.id,
    url: comment.url,
  };
}

// REST review comments carry no thread or resolution state; revalidation decides whether the claim still holds.
function restCommentFinding(comment) {
  return {
    body: comment.body ?? "",
    commentId: comment.id,
    commitSha: comment.commit_id,
    file: comment.path,
    id: `GH-${comment.id}`,
    isOutdated: !Number.isInteger(comment.line),
    isResolved: null,
    line: comment.line ?? comment.original_line,
    reviewState: "open",
    threadId: null,
    url: comment.html_url,
  };
}

function nodeFindings(node) {
  if (isRestComment(node)) {
    return node.in_reply_to_id ? [] : [restCommentFinding(node)];
  }
  const comment = node.comments?.nodes?.[0] ?? node.comments?.[0];
  if (!comment?.databaseId) {
    return [];
  }
  return [threadFinding(node, comment)];
}

function threadFindings(payload) {
  return reviewThreadNodes(payload).flatMap(nodeFindings);
}

function requireSelection(chosen, requested) {
  const found = new Set(chosen.map((finding) => finding.id));
  const missing = [...requested].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Selected GitHub finding not found: ${missing.join(", ")}`);
  }
  const duplicateIds = chosen
    .map((finding) => finding.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`Ambiguous GitHub finding: ${[...new Set(duplicateIds)].join(", ")}`);
  }
}

function normalizeGitHubReviewThreads(payload, selected = []) {
  const requested = new Set(selected.map((id) => id.toUpperCase()));
  let chosen = threadFindings(payload);
  if (requested.size > 0) {
    chosen = chosen.filter((finding) => requested.has(finding.id));
  }
  requireSelection(chosen, requested);
  return chosen;
}

export { normalizeGitHubHierarchy, normalizeGitHubReviewThreads, redactSecrets };
