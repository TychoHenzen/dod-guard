import { anchor } from "./anchor-findings.mjs";
import { FIELD_LIMITS, PATH_SHOWN } from "./finding-text.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { REVIEWERS } from "./reviewer-results.mjs";
import { scannerFinding } from "./scanner-findings.mjs";
import { MESSAGE_SHOWN, RULE_SHOWN } from "./scanner-summary.mjs";
import { widestLabelled } from "./visible-ids.mjs";

// The largest inline comment a review can post, known before any reviewer
// runs. Every text part of a comment is clipped, so samples with each part past
// its clip show the longest text. Every number in a comment is a line, a count
// or an id, so each digit run is measured at the widest safe integer.

const WIDEST = String(Number.MAX_SAFE_INTEGER);
const past = (limit) => "x".repeat(limit * 2);
const measured = (body) => widestLabelled(body).replace(/\d+/gu, WIDEST).length;

// Every lens on one merged finding, each field past its limit.
function judgedFindings() {
  const fields = Object.fromEntries(Object.keys(FIELD_LIMITS).map((name) => [name, past(FIELD_LIMITS[name])]));
  const judged = REVIEWERS.map((reviewer, index) => ({
    ...fields,
    id: `J${index + 1}`,
    reviewer,
    severity: "BLOCKER",
    file: past(PATH_SHOWN),
    line: 1,
  }));
  return mergedFindings([{ members: judged.map(({ id }) => id), representative: judged[0].id }], judged);
}

// Enough violations to pass every summary limit: the shown items and the named
// rules.
const MANY = 12;
const letter = (index) => String.fromCharCode(97 + index);

function violation(index) {
  return {
    rule: `${past(RULE_SHOWN)}${letter(index)}`,
    severity: "high",
    line: index + 1,
    message: past(MESSAGE_SHOWN),
  };
}

// Each group size up to MANY.
function scannerFindings() {
  return Array.from({ length: MANY }, (_, size) => {
    const violations = Array.from({ length: size + 1 }, (_item, index) => violation(index));
    return scannerFinding(past(PATH_SHOWN), violations);
  });
}

// A finding on a file the PR only trims gets the longest moved-location note; a
// judged finding outside the diff gets the other one.
function placedBodies(finding) {
  const removedOnly = { added: new Map(), removed: new Map([[finding.file, new Set([finding.line + 1])]]) };
  const outside = { added: new Map(), removed: new Map() };
  const elsewhere = { path: "elsewhere", line: 1, side: "RIGHT" };
  return [finding, anchor(finding, removedOnly, null), anchor(finding, outside, elsewhere)].map(({ body }) => body);
}

function commentBound() {
  const bodies = [...judgedFindings(), ...scannerFindings()].flatMap(placedBodies);
  return Math.max(...bodies.map(measured));
}

export { commentBound };
