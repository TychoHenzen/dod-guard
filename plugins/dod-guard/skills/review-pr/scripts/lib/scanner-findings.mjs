import { SHOWN, scannerBody } from "./scanner-summary.mjs";

// One file's kept scanner violations become one finding. A violation that
// `scan --base` marked existing was in the code before the pull request, so it
// is listed as a minor note and never raises the file's severity: the pull
// request did not add it, and the CI gate does not block on it either.

function isNewHigh(violation) {
  return violation.severity === "high" && violation.existing !== true;
}

function fileSeverity(violations) {
  if (violations.some(isNewHigh)) {
    return "MAJOR";
  }
  return "MINOR";
}

function preexistingNote(violations) {
  const existing = violations.filter((violation) => violation.existing === true).length;
  if (existing === 0) {
    return null;
  }
  if (existing < violations.length) {
    return `${existing} of these ${violations.length} findings were already in the code before this PR.`;
  }
  if (existing === 1) {
    return "This finding was already in the code before this PR, so it is a minor note.";
  }
  return "These findings were already in the code before this PR, so they are minor notes.";
}

// The note goes under the headline, so a deferred group's one-line form, which
// keeps only the headline, stays as it was.
function withNote(body, note) {
  if (note === null) {
    return body;
  }
  const [headline, ...rest] = body.split("\n");
  return [headline, "", note, ...rest].join("\n");
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = fileSeverity(sorted);
  return {
    severity,
    file,
    line: sorted[0].line,
    body: withNote(scannerBody(severity, sorted), preexistingNote(sorted)),
    scanner: true,
    truncated: sorted.length > SHOWN,
  };
}

export { scannerFinding };
