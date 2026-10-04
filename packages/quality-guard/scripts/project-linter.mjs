import { rustFindings } from "./rust-linter.mjs";
import { csharpFindings } from "./csharp-linter.mjs";
import { ruffFindings } from "./ruff-linter.mjs";
import { linterResult, linterUnavailable } from "./project-linter-result.mjs";
import { ESLINT_EXT, eslintFindings } from "./project-linter-support.mjs";

/** Extension test paired with its finder, tried in order. */
const LINTERS = [
  [
    (lower) => ESLINT_EXT.has(lower.slice(lower.lastIndexOf("."))),
    eslintFindings,
  ],
  [(lower) => lower.endsWith(".py"), ruffFindings],
  [(lower) => lower.endsWith(".rs"), rustFindings],
  [(lower) => lower.endsWith(".cs"), csharpFindings],
];

/** Findings from the repository linter that matches this file. */
export function runProjectLinter(filePath, repoRoot) {
  const lower = filePath.toLowerCase();
  const linter = LINTERS.find(([test]) => test(lower))?.[1];
  if (!linter) return linterResult();
  try {
    const result = linter(filePath, repoRoot);
    return Array.isArray(result) ? linterResult(result) : result;
  } catch (error) {
    return linterUnavailable(
      `project linter failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
