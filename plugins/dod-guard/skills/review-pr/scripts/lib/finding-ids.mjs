import { judgedFindings } from "./reviewer-results.mjs";
import { ruleScope } from "./rule-scope.mjs";
import { slashPath } from "./slash-path.mjs";

function inScope(violation, changedLines) {
  const lines = changedLines.get(slashPath(violation.file));
  if (!lines) {
    return false;
  }
  return ruleScope(violation.rule) === "file" || lines.has(violation.line);
}

const SCANNER_SEVERITIES = new Set(["high", "medium", "low"]);

function requireScannerSeverity(violation) {
  const { file, line, rule, severity } = violation;
  if (!SCANNER_SEVERITIES.has(severity)) {
    throw new Error(
      `quality-guard reported unknown severity "${severity}" for ${file}:${line} (${rule}); ` +
        "update the installed quality-guard plugin",
    );
  }
}

// Code-unit order rather than localeCompare, so the same scan numbers the same
// way on every host whatever its locale.
function compareText(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function byLocation(left, right) {
  return (
    compareText(left.file, right.file) ||
    left.line - right.line ||
    compareText(left.rule, right.rule) ||
    compareText(left.message, right.message)
  );
}

// Scan entries can carry fields the review never reads; the candidate keeps
// the five a merge pass and a posted group need.
function candidate(violation) {
  const { file, line, rule, severity, message } = violation;
  return { file: slashPath(file), line, rule, severity, message };
}

// Cross-file rules only hold on a whole-repository scan, so the scan covers
// everything and this keeps the PR's share. The ids exist before planning, so
// the planner can name them in scanner check questions.
function scannerCandidates(scan, changedLines) {
  const violations = scan.violations ?? [];
  for (const violation of violations) {
    requireScannerSeverity(violation);
  }
  return violations
    .filter((violation) => inScope(violation, changedLines))
    .map(candidate)
    .sort(byLocation)
    .map((violation, index) => ({ id: `S${index + 1}`, ...violation }));
}

// The build numbers the findings itself, so a merge output can only refer to
// findings the judges returned. The id goes last so an id a judge wrote into a
// finding cannot replace it.
function judgedCandidates(results, assigned) {
  const findings = judgedFindings(results, assigned);
  return findings.map((finding, index) => ({ ...finding, id: `J${index + 1}` }));
}

export { judgedCandidates, scannerCandidates };
