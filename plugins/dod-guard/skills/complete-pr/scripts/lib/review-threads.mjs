import { CompletionError } from "./completion-error.mjs";
import { errorMessage, ghJson } from "./gh-runner.mjs";

const REVIEW_THREADS_QUERY = [
  "query($owner: String!, $name: String!, $number: Int!, $cursor: String) {",
  "repository(owner: $owner, name: $name) {",
  "pullRequest(number: $number) {",
  "reviewThreads(first: 100, after: $cursor) {",
  "nodes { id isResolved isOutdated path comments(first: 1) { nodes { url author { login } } } }",
  "pageInfo { hasNextPage endCursor }",
  "}",
  "}",
  "}",
  "}",
].join(" ");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unresolvedReviewThread(node) {
  const firstComment = node.comments?.nodes?.[0];
  if (typeof firstComment?.url !== "string" || firstComment.url.trim().length === 0) {
    throw new Error(`review thread ${node.id} has no first comment URL`);
  }
  return {
    author: firstComment.author?.login ?? null,
    id: node.id,
    // ASSUMPTION: a missing isOutdated is reported as false; the requirement names no fallback and
    // the merge gate never reads this field.
    outdated: node.isOutdated === true,
    path: node.path,
    url: firstComment.url,
  };
}

function reviewThreadConnection(data) {
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    throw new Error(`GraphQL response carried errors: ${JSON.stringify(data.errors)}`);
  }
  const reviewThreads = data?.data?.repository?.pullRequest?.reviewThreads;
  const hasConnection =
    isPlainObject(reviewThreads) && Array.isArray(reviewThreads.nodes) && isPlainObject(reviewThreads.pageInfo);
  if (!hasConnection) {
    throw new Error("GraphQL response has no reviewThreads object with nodes and pageInfo");
  }
  return reviewThreads;
}

function unresolvedReviewThreads(nodes) {
  const threads = [];
  for (const node of nodes) {
    if (!isPlainObject(node) || typeof node.isResolved !== "boolean") {
      throw new Error("GraphQL response has a review thread without a boolean isResolved");
    }
    if (!node.isResolved) {
      threads.push(unresolvedReviewThread(node));
    }
  }
  return threads;
}

function readReviewThreadsPage(data) {
  const { nodes, pageInfo } = reviewThreadConnection(data);
  const { endCursor, hasNextPage } = pageInfo;
  // ASSUMPTION: a non-boolean hasNextPage is malformed, because "read until hasNextPage is false" does not
  // cover a missing value and reading it as the last page would fail open.
  if (typeof hasNextPage !== "boolean") {
    throw new Error("GraphQL response pageInfo.hasNextPage is not a boolean");
  }
  return { endCursor, hasNextPage, threads: unresolvedReviewThreads(nodes) };
}

function reviewThreadsArgs(repository, pullNumber, cursor) {
  const [owner, name] = repository.split("/");
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${REVIEW_THREADS_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
    "-F",
    `number=${pullNumber}`,
  ];
  if (cursor !== null) {
    args.push("-f", `cursor=${cursor}`);
  }
  return args;
}

function readThreadPages(repository, pullNumber, commandRunner) {
  const threads = [];
  const usedCursors = new Set();
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const { data } = ghJson(reviewThreadsArgs(repository, pullNumber, cursor), [0], commandRunner);
    const { endCursor, hasNextPage: morePages, threads: pageThreads } = readReviewThreadsPage(data);
    threads.push(...pageThreads);
    hasNextPage = morePages;
    if (hasNextPage) {
      if (typeof endCursor !== "string" || endCursor.length === 0 || usedCursors.has(endCursor)) {
        throw new Error("pagination is incomplete: hasNextPage is true without a new endCursor");
      }
      usedCursors.add(endCursor);
      cursor = endCursor;
    }
  }
  return threads;
}

export function readUnresolvedReviewThreads(repository, pullNumber, commandRunner) {
  try {
    return readThreadPages(repository, pullNumber, commandRunner);
  } catch (error) {
    if (error instanceof CompletionError && error.code === "review-threads-unavailable") {
      throw error;
    }
    throw new CompletionError(
      "review-threads-unavailable",
      `Review threads for pull request #${pullNumber} could not be read: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}
