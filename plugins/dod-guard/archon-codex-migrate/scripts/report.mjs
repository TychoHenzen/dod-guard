// The run's report: each slice's result, what went unobserved, and the
// proposal, written to report.md for the pull request body.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, statePath } from "./common.mjs";

const UNFLAGGED = "; the scanner flags none of this text, so only the tests and the diff check verified it";

function resultDetail(result) {
  if (result?.commit) {
    return ` in ${result.commit.slice(0, 10)}`;
  }
  return result?.reason ? `: ${result.reason}` : "";
}

function unflaggedNote(slice, result) {
  return result?.commit && slice.kind === "reword" && slice.signals.length === 0 ? UNFLAGGED : "";
}

function sliceLine(slice, result) {
  const status = result ? result.status : "not approved";
  const note = unflaggedNote(slice, result);
  return `- ${slice.id} ${slice.label} (${slice.kind}): ${status}${resultDetail(result)}${note}`;
}

function sliceLines(items, state) {
  const lines = items.slices.map((slice) => sliceLine(slice, state.results[slice.id]));
  if (items.slices.length === 0) {
    lines.push("- The proposal named no slice.");
  }
  for (const entry of items.rejected) {
    lines.push(`- ${entry.id} ${entry.label}: not offered, ${entry.problem}`);
  }
  return lines;
}

function notObservedLines(items) {
  const lines = [
    "- Neither runtime was asked to name its active instruction sources; " +
      "open Codex and Claude in this checkout to confirm.",
  ];
  if (items.test === "") {
    lines.push("- The project documents no test command, so no slice claims a test pass.");
  }
  return lines;
}

function proposalLines(dir) {
  const proposal = join(dir, "proposal.md");
  return existsSync(proposal) ? ["", "### Proposal", "", readFileSync(proposal, "utf8").trim()] : [];
}

export function report({ dir }) {
  const items = readJson(join(dir, "items.json"));
  const state = existsSync(statePath(dir)) ? readJson(statePath(dir)) : { queue: [], results: {} };
  const out = [
    "## Codex migration",
    "",
    "### Slices",
    "",
    ...sliceLines(items, state),
    "",
    "### Not observed",
    "",
    ...notObservedLines(items),
    ...proposalLines(dir),
  ];
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}
