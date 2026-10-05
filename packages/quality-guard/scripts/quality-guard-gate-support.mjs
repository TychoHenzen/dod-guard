import { scanFile } from "./quality-guard-gate-scan.mjs";
const MAX_REPORTED = 20;
export function prepareGate({ filePath, repoRoot, services, rules }) {
  const scanResult = scanFile({
    filePath,
    repoRoot,
    scanner: services.runScanner,
    rules,
  });
  if (scanResult.error) return scanResult;
  return scanResult;
}
function reportContext(header, lines, tail) {
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
function emitProtocol(contexts) {
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
export function createHookOutput() {
  const contexts = [];
  const report = (header, lines, tail) => {
    contexts.push(reportContext(header, lines, tail));
    return 0;
  };
  return {
    report,
    unavailable: (filePath, detail) => unavailable(filePath, detail, report),
    flush: () => emitProtocol(contexts),
  };
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
const SEVERITY_ALIASES = {
  error: "high",
  warn: "medium",
  high: "high",
  medium: "medium",
  low: "low",
};

export function advisoryFindings(violations) {
  return violations
    .map((violation) => {
      const {
        file = "unknown-file",
        line = "?",
        severity,
        rule = "unknown-rule",
        message = "no message",
      } = violation;
      const normalized = SEVERITY_ALIASES[severity];
      return normalized
        ? `${file}:${line} [${normalized}] ${rule}: ${message} (advisory finding)`
        : null;
    })
    .filter((finding) => finding !== null);
}

export function hardBoundFindings(violations) {
  return advisoryFindings(violations);
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
