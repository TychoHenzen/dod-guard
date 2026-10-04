import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";
import { localResult } from "./quality-guard-local.mjs";
import {
  absoluteTail,
  isUnseen,
  report,
  trackedTail,
  unavailableTail,
} from "./quality-guard-gate-support.mjs";
import {
  FILE_RULES,
  baselinePath,
  findRepoRoot,
  readComparison,
  relativePath,
  runScanner,
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
  let local;
  try {
    local = deps.localResult(input, filePath, repoRoot);
  } catch (error) {
    return report(
      `quality-guard advisory unavailable for ${filePath}. The write continues.`,
      [
        `[unavailable] project-linter failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      unavailableTail(filePath),
    );
  }
  if (local !== 0) return local;
  process.stderr.write(
    `quality-guard file-local advisory feedback passed for ${filePath}.\n`,
  );
  return 0;
}

export function gate(input, filePath, deps = {}) {
  const services = { ...DEFAULT_SERVICES, ...deps };
  const repoRoot = findRepoRoot(filePath);
  if (!repoRoot) {
    return report(
      `quality-guard advisory unavailable for ${filePath}. The write continues.`,
      ["[unavailable] no Git repository root was found."],
      unavailableTail(filePath),
    );
  }
  const baseline = baselinePath(repoRoot);
  let scan;
  try {
    scan = services.runScanner(filePath, repoRoot, FILE_RULES);
  } catch (error) {
    return report(
      `quality-guard advisory unavailable for ${filePath}. The write continues.`,
      [
        `[unavailable] scanner failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      unavailableTail(filePath),
    );
  }
  if (!scan || !Array.isArray(scan.violations)) {
    return report(
      `quality-guard advisory unavailable for ${filePath}. The write continues.`,
      ["[unavailable] scanner did not return a readable report."],
      unavailableTail(filePath),
    );
  }
  const relPath = relativePath(repoRoot, filePath);
  const comparison = readComparison({
    baseline,
    scan,
    relPath,
    deps: services,
  });
  if (!comparison.ok) {
    return report(
      `quality-guard advisory unavailable for ${filePath}. The write continues.`,
      ["[unavailable] baseline comparison did not produce a readable result."],
      unavailableTail(filePath),
    );
  }
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
