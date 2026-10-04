import { scopeToChangedLines } from "./changed-lines.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import { report } from "./quality-guard-gate-support.mjs";

export function localResult(input, filePath, repoRoot) {
  const result = runProjectLinter(filePath, repoRoot);
  if (result.unavailable) return { unavailable: result.unavailable };
  const findings = scopeToChangedLines(input, result.findings);
  if (findings.length === 0) return 0;
  return report(
    `quality-guard advisory findings for ${filePath}. The write continues.`,
    findings.map(
      (f) =>
        `${filePath}:${f.line} [error] ${f.rule || "project-linter"}: ${f.message}`,
    ),
    "Next step: inspect the repository linter finding and rerun that linter directly.",
  );
}
