import { join } from "node:path";
import {
  deleteSentinel,
  readSentinel,
  recordConsumption,
} from "./sentinel.mjs";
import { SCANNER } from "./quality-guard-gate-scan.mjs";
const MAX_REPORTED = 20;

export function report(header, lines, tail) {
  const shown = lines.slice(0, MAX_REPORTED);
  const extra = lines.length - shown.length;
  const body = [
    header,
    "",
    ...shown,
    extra > 0 ? `... and ${extra} more.` : "",
    "",
    tail,
  ];
  process.stderr.write(`${body.filter(Boolean).join("\n")}\n`);
  return 2;
}

export function absoluteTail(repoRoot) {
  const sentinel = join(repoRoot, ".quality-skip");
  return (
    "This file-local hard bound applies before a baseline exists or knows " +
    "this file. Split it up.\n" +
    `To waive this one write: touch "${sentinel}"\n` +
    "Before committing, run: quality-guard check --staged"
  );
}

export function trackedTail(filePath, repoRoot) {
  const sentinel = join(repoRoot, ".quality-skip");
  return (
    "Fix the new violations, or split the change. The baseline records what " +
    "was\n" +
    "already there, so only the increase blocks. Run the scanner directly:\n" +
    `  node "${SCANNER}" "${filePath}" --root="${repoRoot}"\n` +
    `To waive this tracked regression once: echo '{"rebaseline": true}' > ` +
    `"${sentinel}"\n` +
    "Before committing, run: quality-guard check --staged"
  );
}

export function waive(repoRoot, sentinel, context) {
  if (!sentinel || (!context.isNew && !sentinel.rebaseline)) return false;
  recordConsumption(repoRoot, {
    ...context.record,
    rebaseline: sentinel.rebaseline === true,
  });
  deleteSentinel(repoRoot);
  return true;
}

export function isUnseen(comparison, relPath) {
  return comparison === null || comparison.newFiles.includes(relPath);
}

export function readSentinelState(repoRoot) {
  return readSentinel(repoRoot);
}
