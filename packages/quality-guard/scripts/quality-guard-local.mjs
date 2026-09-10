import { scopeToChangedLines } from "./changed-lines.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import { report } from "./quality-guard-gate-support.mjs";

export function localResult(input, filePath, repoRoot) {
  const findings = scopeToChangedLines(
    input,
    runProjectLinter(filePath, repoRoot),
  );
  if (findings.length === 0) return 0;
  return report(
    `The project linter rejected lines this edit wrote in ${filePath}.`,
    findings.map(
      (f) => `${f.line}: ${f.rule ? `[${f.rule}] ` : ""}${f.message}`,
    ),
    "These rules come from the repository config, not from this hook.",
  );
}
