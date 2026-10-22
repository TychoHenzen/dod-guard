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

function hasContextName(row) {
  return typeof row.context === "string" && row.context !== "";
}

function isWellFormedRow(row) {
  return isPlainObject(row) && hasContextName(row) && KNOWN_STATES.has(row.state);
}

// A well-formed row can produce both a state line and a head line, so each check
// runs on its own.
function contextRemainder({ context, state, headSha: boundSha }, headSha) {
  const remainder = [];
  if (!PASSING_STATES.has(state)) {
    remainder.push(`required context ${context} is ${state}`);
  }
  if (boundSha !== headSha) {
    remainder.push(`required context ${context} is bound to ${boundSha ?? "no head"}, expected ${headSha}`);
  }
  return remainder;
}

// Returns the remainder lines for the rows, in row order.
function checkpointRemainder(rows, headSha) {
  if (rows.length === 0) {
    return ["preflight checkpoint has no required context row"];
  }
  const seen = new Set();
  return rows.flatMap((row, index) => {
    if (!isWellFormedRow(row)) {
      return [`preflight checkpoint row ${index + 1} is malformed`];
    }
    if (seen.has(row.context)) {
      return [`required context ${row.context} appears more than once`];
    }
    seen.add(row.context);
    return contextRemainder(row, headSha);
  });
}

export { checkpointRemainder, readPreflightCheckpoint };
