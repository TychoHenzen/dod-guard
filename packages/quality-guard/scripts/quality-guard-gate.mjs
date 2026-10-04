import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";
import { localResult } from "./quality-guard-local.mjs";
import {
  absoluteTail,
  isUnseen,
  report,
  trackedTail,
  unavailable,
} from "./quality-guard-gate-support.mjs";
import {
  FILE_RULES,
  baselinePath,
  compareFile,
  findRepoRoot,
  relativePath,
  runScanner,
  scanFile,
} from "./quality-guard-gate-scan.mjs";

const DEFAULT_SERVICES = { localResult, runScanner };

function findingsFor(scan, comparison, relPath) {
  const unseen = isUnseen(comparison, relPath);
  const findings = unseen
    ? absoluteVerdict(scan.violations)
    : ratchetVerdict(comparison, relPath, scan.violations);
  return { unseen, findings };
}

function advisoryResult(context) {
  const { repoRoot, filePath, unseen, findings } = context;
  if (findings.length === 0) return 0;
  return report(
    `quality-guard advisory findings for ${filePath}. The write continues.`,
    findings,
    unseen ? absoluteTail(repoRoot) : trackedTail(filePath, repoRoot),
  );
}

function continueGate(context) {
  const { input, filePath, repoRoot, scan, comparison, relPath, deps } =
    context;
  const { unseen, findings } = findingsFor(scan, comparison, relPath);
  const advisory = advisoryResult({
    repoRoot,
    filePath,
    relPath,
    unseen,
    findings,
  });
  if (advisory !== 0) return advisory;
  try {
    const local = deps.localResult(input, filePath, repoRoot);
    if (local !== 0) return local;
    process.stderr.write(
      `quality-guard file-local advisory feedback passed for ${filePath}.\n`,
    );
    return 0;
  } catch (error) {
    return unavailable(
      filePath,
      `project-linter failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function gate(input, filePath, deps = {}) {
  const services = { ...DEFAULT_SERVICES, ...deps };
  const repoRoot = findRepoRoot(filePath);
  if (!repoRoot)
    return unavailable(filePath, "no Git repository root was found.");
  const baseline = baselinePath(repoRoot);
  const scanResult = scanFile({
    filePath,
    repoRoot,
    scanner: services.runScanner,
    rules: FILE_RULES,
  });
  if (scanResult.error) return unavailable(filePath, scanResult.error);
  const { scan } = scanResult;
  const relPath = relativePath(repoRoot, filePath);
  const comparison = compareFile({ baseline, scan, relPath, services });
  if (!comparison.ok)
    return unavailable(
      filePath,
      "baseline comparison did not produce a readable result.",
    );
  return continueGate({
    input,
    filePath,
    repoRoot,
    scan,
    comparison: comparison.value,
    relPath,
    deps: services,
  });
}
