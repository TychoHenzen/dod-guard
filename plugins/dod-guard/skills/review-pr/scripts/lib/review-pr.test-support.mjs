// Shared by the review-pr test files. The name does not match the test glob
// (*.test.mjs), so the runner never loads it as a test file.

export const REPO_URL = "https://api.github.com/repos/TychoHenzen/dod-guard";

// The six diff lines Git writes for a docs file with a non-ASCII name, with
// core.quotePath=true.
export const QUOTED_PATH_HUNK = [
  'diff --git "a/docs/\\303\\274.md" "b/docs/\\303\\274.md"',
  '--- "a/docs/\\303\\274.md"',
  '+++ "b/docs/\\303\\274.md"',
  "@@ -1 +1 @@",
  "-old",
  "+new",
];

// The finding the reviewer-result tests build. Each caller names its own file
// and evidence, so every assertion keeps the values it always had.
export function judgment({ file, evidence, ...overrides }) {
  return {
    severity: "MAJOR",
    file,
    line: 72,
    problem: "Outdated threads are skipped",
    impact: "Real findings are never fixed",
    requirement: "AC 2",
    correction: "Keep outdated threads open",
    rootCause: "Outdated treated as stale",
    evidence,
    ...overrides,
  };
}

// The PBI issue JSON. The two checkbox decoys sit under Outcome and
// Verification, outside the acceptance criteria. A fresh object each call.
export function pbiJson(overrides = {}) {
  return {
    number: 837,
    repository_url: REPO_URL,
    body: [
      "## Outcome",
      "",
      "- [ ] not a criterion",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] AC-01 first",
      "- [x] AC-02 second",
      "",
      "## Verification",
      "",
      "- [ ] not a criterion",
      "",
    ].join("\n"),
    ...overrides,
  };
}
