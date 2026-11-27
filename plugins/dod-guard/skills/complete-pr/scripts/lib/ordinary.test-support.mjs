// Shared ordinary-path fixtures: issue 61 with a two-item acceptance checklist, and pull request 62 whose
// body closes it, declares the ordinary path, and checks both items. The state object feeds the fake gh
// runner of the record-legacy tests, which answers the same issue and pull request numbers.
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import { HEAD, ISSUE, MERGE, PULL, REPO, runnerOf } from "./closure-legacy.fake-gh.mjs";

const CRITERIA = ["The proof passes an ordinary pull request.", "The record posts once."];
const DECLARATION = "- Handoff: none, ordinary path";

function checklist(items) {
  return items.map(([checked, text]) => `- [${checked ? "x" : " "}] ${text}`);
}

function issueBody(items = CRITERIA.map((text) => [false, text])) {
  return ["## Problem", "", "A small fix.", "", "## Acceptance criteria", "", ...checklist(items), ""].join("\n");
}

function pullBody({ items = CRITERIA.map((text) => [true, text]), declaration = DECLARATION } = {}) {
  return [
    "The fix.",
    "",
    "## Acceptance criteria",
    "",
    ...checklist(items),
    "",
    `Closes #${ISSUE}`,
    "",
    "## Convergence",
    declaration,
    "- Remainder: none",
    "",
  ].join("\n");
}

function openPull() {
  return {
    number: PULL,
    state: "open",
    merged_at: null,
    merge_commit_sha: null,
    base: { ref: "main" },
    head: { sha: HEAD, repo: { full_name: REPO } },
    body: pullBody(),
  };
}

// The pull request after its merge: closed, with a merge commit, and the issue closed by its keyword.
function merge(state) {
  Object.assign(state.pull, { state: "closed", merged_at: "2026-11-27T10:00:00Z", merge_commit_sha: MERGE });
  Object.assign(state.issue, { state: "closed", state_reason: "completed" });
}

function ordinaryState({ merged = false } = {}) {
  const state = {
    defaultBranch: "main",
    issue: { number: ISSUE, state: "open", body: issueBody(), sub_issues_summary: { total: 0, completed: 0 } },
    pull: openPull(),
    comments: [],
    checkConclusion: "success",
    nextId: 100,
    writes: [],
    calls: [],
  };
  if (merged) {
    merge(state);
  }
  return state;
}

function ordinaryFixture(options) {
  const state = ordinaryState(options);
  return { state, runner: runnerOf(state) };
}

export { CRITERIA, DECLARATION, issueBody, ordinaryFixture, pullBody };
