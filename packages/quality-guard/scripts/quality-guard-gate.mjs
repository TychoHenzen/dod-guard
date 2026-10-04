import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";
import { localResult } from "./quality-guard-local.mjs";
import {
  absoluteTail,
  isUnseen,
  prepareGate,
  report,
  trackedTail,
  unavailable,
} from "./quality-guard-gate-support.mjs";
import {
  FILE_RULES,
  findRepoRoot,
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
  const prepared = prepareGate({
    filePath,
    repoRoot,
    services,
    rules: FILE_RULES,
  });
  if (prepared.error) return unavailable(filePath, prepared.error);
  return continueGate({
    input,
    filePath,
    repoRoot,
    ...prepared,
    deps: services,
  });
}
