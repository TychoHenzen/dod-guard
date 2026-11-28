import { scannerBody, scannerHeadline } from "./scanner-summary.mjs";

// One file's kept scanner violations become one finding. `scan --base` keeps
// findings the merge base already had out of the S ids, so each one here is new
// in the pull request, and one high finding makes the file MAJOR.

function fileSeverity(violations) {
  return violations.some((violation) => violation.severity === "high") ? "MAJOR" : "MINOR";
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = fileSeverity(sorted);
  return {
    severity,
    file,
    line: sorted[0].line,
    headline: scannerHeadline(sorted),
    body: scannerBody(severity, sorted),
    scanner: true,
  };
}

export { scannerFinding };
