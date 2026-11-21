// The run's report.md: what was deleted or restored, what was ported first,
// what was kept and why, what the gates reverted, and the survey's notes.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, readJsonOr } from "./io.mjs";

const NOTHING = "- Nothing.";

function bullet(text) {
  return `- ${text}`;
}

function nothingIfEmpty(lines) {
  return lines.length > 0 ? lines : [NOTHING];
}

function itemDeletions(item, repo) {
  const lines = [];
  const gone = item.delete.filter((path) => !existsSync(join(repo, path)));
  const kept = item.delete.filter((path) => existsSync(join(repo, path)));
  if (gone.length > 0) {
    const keep = item.keep.join(", ") || "(none named)";
    lines.push(bullet(`${item.id} ${item.label}: deleted ${gone.join(", ")}; superseded by ${keep}`));
  }
  if (kept.length > 0) {
    lines.push(bullet(`${item.id} ${item.label}: kept ${kept.join(", ")}, restored after the checks failed on it`));
  }
  return lines;
}

function deletedLines(approved, repo) {
  return approved.length > 0 ? approved.flatMap((item) => itemDeletions(item, repo)) : [NOTHING];
}

function portedLines(approved) {
  return nothingIfEmpty(approved.flatMap((item) => item.ports.map((port) => bullet(`${item.id}: ${port}`))));
}

function keptLines({ declined, rejected, weak }) {
  return nothingIfEmpty([
    ...declined.map((item) => bullet(`${item.id} ${item.label}: not approved`)),
    ...rejected.map((item) => bullet(`${item.id} ${item.label}: not offered, ${item.problem}`)),
    ...weak.map((line) => bullet(`Weak, left alone: ${line}`)),
  ]);
}

function revertedLines(reverted) {
  if (reverted.length === 0) {
    return [];
  }
  return ["", "### Reverted", "", ...reverted.map((entry) => bullet(`${entry.path} (${entry.kind}): ${entry.reason}`))];
}

function notesLines(notes) {
  return notes ? ["", "### Notes", "", notes] : [];
}

// Everything the report draws on. Without approved.json no answer was
// recorded, so every offered item counts as declined.
function runRecord(dir) {
  const { items: offered, rejected, weak, notes } = readJson(join(dir, "items.json"));
  const record = readJsonOr(join(dir, "approved.json"), null);
  return {
    approved: record?.approved ?? [],
    declined: record?.declined ?? offered,
    rejected,
    weak,
    notes,
    reverted: readJsonOr(join(dir, "reverted.json"), []),
  };
}

export function report({ dir, repo }) {
  const run = runRecord(dir);
  const out = [
    "## Clean house",
    "",
    "### Deleted",
    "",
    ...deletedLines(run.approved, repo),
    "",
    "### Ported first",
    "",
    ...portedLines(run.approved),
    "",
    "### Kept",
    "",
    ...keptLines(run),
    ...revertedLines(run.reverted),
    ...notesLines(run.notes),
  ];
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}
