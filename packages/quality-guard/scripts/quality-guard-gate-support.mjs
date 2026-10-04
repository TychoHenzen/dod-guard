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
  return 0;
}

export function absoluteTail(repoRoot) {
  return (
    "Next step: inspect the finding and split the change or run the scanner " +
    `directly for more detail. The write continues for ${repoRoot}.`
  );
}

export function trackedTail(filePath, repoRoot) {
  return (
    "Next step: inspect the baseline comparison and run the scanner directly:\n" +
    `  node "${SCANNER}" "${filePath}" --root="${repoRoot}"\n` +
    "The write continues; this output is advisory evidence only."
  );
}

export function unavailableTail(filePath) {
  return (
    `Next step: run the relevant Quality Guard diagnostic again for "${filePath}" ` +
    "inside a repository. The write continues."
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
