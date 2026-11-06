import { fakeGitHub, mergeResult, REPOSITORY, recordedSnapshot } from "../closure.test-support.mjs";
import { recordCompletion } from "../closure-completion.mjs";

export const CLOSING_ISSUE = 683;
export const QUOTING_COMMENT_ID = 7001;
export const PENDING_ROWS_EMPTY = /"pendingRows": \[\]/;

export const PASSING = [{ id: "AC-01", status: "pass" }];
export const SETTLED = [
  { id: "AC-01", status: "pass" },
  { id: "AC-11", status: "pass" },
];

export const closingComments = (github) => github.state.issues.get(CLOSING_ISSUE).comments;

// A snapshot whose closing issue carries exactly the given comments.
export function snapshotWithComments(comments) {
  const snapshot = recordedSnapshot();
  snapshot.issues.find(({ number }) => number === CLOSING_ISSUE).comments = comments;
  return { snapshot, github: fakeGitHub(snapshot) };
}

export function recordFor(github, matrix) {
  return recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([CLOSING_ISSUE]),
    matrix,
    runner: github.runner,
  });
}
