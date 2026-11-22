import { existsSync } from "node:fs";
import { readTextFile } from "../../../lib/read-text.mjs";
import { approvalProblems } from "./exact-text.mjs";

const APPROVED_CUTS_HEADING = "### Approved cuts";

function readOrNull(path) {
  try {
    return { text: readTextFile(path) };
  } catch {
    return null;
  }
}

// Reads a file that must exist; records the absent problem or "unreadable" and returns null otherwise.
export function readExisting(path, problems, absentProblem) {
  if (!existsSync(path)) {
    problems.push({ file: path, problem: absentProblem });
    return null;
  }
  const read = readOrNull(path);
  if (!read) problems.push({ file: path, problem: "unreadable" });
  return read ? read.text : null;
}

// A file that is absent or blank is "missing or empty"; one that cannot be decoded is "unreadable".
export function checkRequiredText(path, problems) {
  const text = readExisting(path, problems, "missing or empty");
  if (text !== null && !text.trim()) {
    problems.push({ file: path, problem: "missing or empty" });
    return null;
  }
  return text;
}

export function checkAudit(path, problems) {
  const text = checkRequiredText(path, problems);
  if (text === null) return;
  const hasHeading = text.split(/\r?\n/).some((line) => line.trim() === APPROVED_CUTS_HEADING);
  if (!hasHeading) problems.push({ file: path, problem: "no ### Approved cuts heading" });
}

// Returns the parsed approvals value, or null after recording why it is unusable.
function parseApprovals(path, problems) {
  const text = readExisting(path, problems, "missing");
  if (text === null) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    problems.push({ file: path, problem: "not JSON" });
    return null;
  }
  const found = approvalProblems(value);
  for (const problem of found) problems.push({ file: path, problem });
  return found.length > 0 ? null : value;
}

// Returns the approved cut texts; an unusable approvals file approves nothing.
export function checkApprovals(path, problems) {
  const value = parseApprovals(path, problems);
  if (value === null) return [];
  return value.approvedCuts.map((cut) => cut.text).filter((text) => typeof text === "string" && text.length > 0);
}
