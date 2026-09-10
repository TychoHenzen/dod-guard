import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";
import { localResult } from "./quality-guard-local.mjs";
import {
  absoluteTail,
  isUnseen,
  report,
  readSentinelState,
  trackedTail,
  waive,
} from "./quality-guard-gate-support.mjs";
import {
  baselinePath,
  findRepoRoot,
  readComparison,
  relativePath,
  runScanner,
} from "./quality-guard-gate-scan.mjs";

function blockingFor(scan, comparison, relPath) {
  const unseen = isUnseen(comparison, relPath);
  const blocking = unseen
    ? absoluteVerdict(scan.violations)
    : ratchetVerdict(comparison, relPath, scan.violations);
  return { unseen, blocking };
}

function blockingResult({ repoRoot, filePath, relPath, unseen, blocking }) {
  if (
    blocking.length === 0 ||
    waive(repoRoot, readSentinelState(repoRoot), {
      isNew: unseen,
      record: { file: relPath, reasons: blocking },
    })
  )
    return 0;
  return report(
    `quality-guard blocked this file-local write. ${filePath} did not ` +
      "pass its applicable check.",
    blocking,
    unseen ? absoluteTail(repoRoot) : trackedTail(filePath, repoRoot),
  );
}

function continueGate({
  input,
  filePath,
  repoRoot,
  scan,
  comparison,
  relPath,
}) {
  const { unseen, blocking } = blockingFor(scan, comparison, relPath);
  const blocked = blockingResult({
    repoRoot,
    filePath,
    relPath,
    unseen,
    blocking,
  });
  if (blocked !== 0) return blocked;
  const local = localResult(input, filePath, repoRoot);
  if (local !== 0) return local;
  process.stderr.write(
    `quality-guard file-local feedback passed for ${filePath}. This is ` +
      "not commit evidence.\n" +
      "Run quality-guard check --staged before committing.\n",
  );
  return 0;
}

export function gate(input, filePath, deps) {
  const repoRoot = findRepoRoot(filePath);
  const baseline = baselinePath(repoRoot);
  const scan = runScanner(filePath, repoRoot);
  if (!scan || !Array.isArray(scan.violations)) return 0;
  const relPath = relativePath(repoRoot, filePath);
  const comparison = readComparison({ baseline, scan, relPath, deps });
  if (!comparison.ok) return 0;
  return continueGate({
    input,
    filePath,
    repoRoot,
    scan,
    comparison: comparison.value,
    relPath,
  });
}
