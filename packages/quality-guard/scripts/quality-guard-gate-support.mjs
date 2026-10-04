import {
  baselinePath,
  readComparison,
  relativePath,
  scanFile,
  SCANNER,
} from "./quality-guard-gate-scan.mjs";
const MAX_REPORTED = 20;

export function prepareGate({ filePath, repoRoot, services, rules }) {
  const scanResult = scanFile({
    filePath,
    repoRoot,
    scanner: services.runScanner,
    rules,
  });
  if (scanResult.error) return scanResult;
  const { scan } = scanResult;
  const relPath = relativePath(repoRoot, filePath);
  const comparison = readComparison({
    baseline: baselinePath(repoRoot),
    scan,
    relPath,
    deps: services,
  });
  if (!comparison.ok)
    return {
      error: "baseline comparison did not produce a readable result.",
    };
  return { scan, comparison: comparison.value, relPath };
}

export function reportContext(header, lines, tail) {
  const shown = lines.slice(0, MAX_REPORTED);
  const extra = lines.length - shown.length;
  return [
    header,
    "",
    ...shown,
    extra > 0 ? `... and ${extra} more.` : "",
    "",
    tail,
  ]
    .filter(Boolean)
    .join("\n");
}

export function emitProtocol(contexts) {
  if (contexts.length === 0) return;
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: contexts.join("\n\n"),
      },
    })}\n`,
  );
}

export function report(header, lines, tail) {
  emitProtocol([reportContext(header, lines, tail)]);
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

function unavailableTail(filePath) {
  return (
    `Next step: run the relevant Quality Guard diagnostic again for "${filePath}" ` +
    "inside a repository. The write continues."
  );
}

export function unavailable(filePath, detail, emit = report) {
  return emit(
    `quality-guard advisory unavailable for ${filePath}. The write continues.`,
    [`[unavailable] ${detail}`],
    unavailableTail(filePath),
  );
}

export function isUnseen(comparison, relPath) {
  return comparison === null || comparison.newFiles.includes(relPath);
}
