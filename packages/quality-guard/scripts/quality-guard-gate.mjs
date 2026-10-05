import { localResult } from "./quality-guard-local.mjs";
import {
  absoluteTail,
  advisoryFindings,
  prepareGate,
  report,
  unavailable,
} from "./quality-guard-gate-support.mjs";
import {
  FILE_RULES,
  findRepoRoot,
  runScanner,
} from "./quality-guard-gate-scan.mjs";

const DEFAULT_SERVICES = { localResult, report, runScanner, unavailable };

function advisoryResult(context) {
  const { repoRoot, filePath, findings, emit } = context;
  if (findings.length === 0) return 0;
  return emit(
    `quality-guard advisory findings for ${filePath}. The write continues.`,
    findings,
    absoluteTail(repoRoot),
  );
}

function localFeedback(context) {
  const { input, filePath, repoRoot, deps } = context;
  try {
    const local = deps.localResult(input, filePath, repoRoot);
    if (local?.unavailable)
      return deps.unavailable(
        filePath,
        `project-linter unavailable: ${local.unavailable}`,
      );
    if (local !== 0) return local;
    process.stderr.write(
      `quality-guard file-local advisory feedback passed for ${filePath}.\n`,
    );
    return 0;
  } catch (error) {
    return deps.unavailable(
      filePath,
      `project-linter failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function continueGate(context) {
  const { input, filePath, repoRoot, scan, deps } = context;
  const findings = advisoryFindings(scan.violations);
  const advisory = advisoryResult({
    repoRoot,
    filePath,
    findings,
    emit: deps.report,
  });
  if (advisory !== 0) return advisory;
  return localFeedback({ input, filePath, repoRoot, deps });
}

export function gate(input, filePath, deps = {}) {
  const services = { ...DEFAULT_SERVICES, ...deps };
  const repoRoot = findRepoRoot(filePath);
  if (!repoRoot)
    return services.unavailable(filePath, "no Git repository root was found.");
  const prepared = prepareGate({
    filePath,
    repoRoot,
    services,
    rules: FILE_RULES,
  });
  if (prepared.error) return services.unavailable(filePath, prepared.error);
  return continueGate({
    input,
    filePath,
    repoRoot,
    ...prepared,
    deps: services,
  });
}
