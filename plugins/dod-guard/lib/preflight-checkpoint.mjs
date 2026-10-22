// Reads the `## Preflight checkpoint` record of a next-ticket implementation
// handoff. The record is one JSON array of required-context rows in a fenced
// json block under the heading, the same shape as the acceptance matrix. Every
// function is pure; fetching the handoff comment belongs to the callers.
import { lines, markdownSection, markedLines } from "./acceptance-criteria.mjs";
import { jsonBlock } from "./issue-body-records.mjs";

const CHECKPOINT_HEADING = "## Preflight checkpoint";
// A "present" or "skipped" row is the only state that lets a context pass, so
// every other known state is a named remainder rather than a silent pass.
const PASSING_STATES = new Set(["present", "skipped"]);
const KNOWN_STATES = new Set(["present", "pending", "failed", "skipped", "unavailable"]);

// A second heading would be a second record, and the proof would read only the
// first, so two headings are refused instead of one being silently ignored.
function checkpointHeadingCount(text) {
  return markedLines(text).filter((line) => !line.fenced && line.text.trimEnd() === CHECKPOINT_HEADING).length;
}

// Returns { absent: true } when the handoff has no record, { rows } with the
// rows, else { error } naming what is wrong.
function readPreflightCheckpoint(text) {
  const count = checkpointHeadingCount(text);
  if (count === 0) {
    return { absent: true };
  }
  if (count > 1) {
    return { error: `handoff has more than one ${CHECKPOINT_HEADING} section` };
  }
  const block = jsonBlock(markdownSection(lines(text), "Preflight checkpoint"));
  if (block.error) {
    return { error: `preflight checkpoint ${block.error}` };
  }
  if (!Array.isArray(block.value)) {
    return { error: "preflight checkpoint is not a JSON array" };
  }
  return { rows: block.value };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Returns the remainder lines for the rows, in row order. A row can produce both
// a state line and a head line, so each check runs on its own.
function checkpointRemainder(rows, headSha) {
  if (rows.length === 0) {
    return ["preflight checkpoint has no required context row"];
  }
  const remainder = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const n = index + 1;
    if (!isPlainObject(row) || typeof row.context !== "string" || row.context === "" || !KNOWN_STATES.has(row.state)) {
      remainder.push(`preflight checkpoint row ${n} is malformed`);
      return;
    }
    const { context, state } = row;
    if (seen.has(context)) {
      remainder.push(`required context ${context} appears more than once`);
      return;
    }
    seen.add(context);
    if (!PASSING_STATES.has(state)) {
      remainder.push(`required context ${context} is ${state}`);
    }
    if (row.headSha !== headSha) {
      remainder.push(`required context ${context} is bound to ${row.headSha ?? "no head"}, expected ${headSha}`);
    }
  });
  return remainder;
}

export { checkpointRemainder, readPreflightCheckpoint };
