import { rustFindings } from "./rust-linter.mjs";
import { csharpFindings } from "./csharp-linter.mjs";
import {
  ESLINT_EXT,
  eslintFindings,
  ruffFindings,
} from "./project-linter-support.mjs";

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
  try {
    return (
      LINTERS.find(([test]) => test(lower))?.[1]?.(filePath, repoRoot) ?? []
    );
  } catch {
    return [];
  }
}
