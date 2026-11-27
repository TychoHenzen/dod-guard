import { clip } from "./finding-text.mjs";
import { MESSAGE_SHOWN, scannerBody, scannerHeadline } from "./scanner-summary.mjs";

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

const NEW_TAG = " (new in this PR)";

const isExisting = (violation) => violation.existing === true;

function tagNew(violation) {
  if (isExisting(violation)) {
    return violation;
  }
  // The message is clipped first, so the tag survives the body's own clip.
  return { ...violation, message: `${clip(violation.message, MESSAGE_SHOWN - NEW_TAG.length)}${NEW_TAG}` };
}

// In a group that mixes both, each finding the pull request added says so, so
// a fix can start with those. A group of one kind needs no tags.
function taggedNew(sorted) {
  const existing = sorted.filter(isExisting).length;
  if (existing === 0 || existing === sorted.length) {
    return sorted;
  }
  return sorted.map(tagNew);
}

function preexistingNote(violations) {
  const existing = violations.filter(isExisting).length;
  if (existing === 0) {
    return null;
  }
  if (existing < violations.length) {
    return (
      `${existing} of these ${violations.length} findings were already in the code before this PR; ` +
      `the ones it added end with "${NEW_TAG.trim()}".`
    );
  }
  if (existing === 1) {
    return "This finding was already in the code before this PR, so it is a minor note.";
  }
  return "These findings were already in the code before this PR, so they are minor notes.";
}

// The note goes under the thread's first line, which names the severity and count.
function withNote(body, note) {
  if (note === null) {
    return body;
  }
  const [headline, ...rest] = body.split("\n");
  return [headline, "", note, ...rest].join("\n");
}

// The body line keeps only the headline, so it says why a high finding is a
// minor note.
function existingSuffix(violations) {
  const existing = violations.filter(isExisting).length;
  if (existing === 0) {
    return "";
  }
  if (existing === violations.length) {
    return " (all already in the code before this PR)";
  }
  return ` (${existing} already in the code before this PR)`;
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = fileSeverity(sorted);
  return {
    severity,
    file,
    line: sorted[0].line,
    headline: `${scannerHeadline(sorted)}${existingSuffix(sorted)}`,
    body: withNote(scannerBody(severity, taggedNew(sorted)), preexistingNote(sorted)),
    scanner: true,
  };
}

export { scannerFinding };
