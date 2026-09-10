import { resolve } from "node:path";
import {
  comparisonFor,
  resultFor,
  writeBaselineIfRequested,
  writeResult,
} from "./quality-scan-output.mjs";
import { sortViolations, summarize } from "./lib/report.mjs";
import { scanFile } from "./lib/rules-file.mjs";
import { checkDuplication, checkReachability } from "./lib/rules-project.mjs";
import { collectManifests } from "./lib/manifests.mjs";
import { collectFiles, loadFiles } from "./lib/walk.mjs";
export function scan(options, config) {
  const targets = options.paths.map((path) => resolve(options.root, path));
  const files = loadFiles(
    collectFiles(targets, options.root, options.excludes),
    options.testPaths,
  );
  // Collect manifests from the repository root because a narrowed source target
  // must still see scenes and project files that reference its exported types.
  const manifests = collectManifests(options.root, options.excludes);
  const scans = new Map();
  let violations = [];
  for (const file of files) {
    const result = scanFile(file, config);
    scans.set(file.rel, result);
    violations = violations.concat(result.violations);
  }
  violations = violations.concat(
    checkReachability({ files, scans, config, manifests }),
  );
  violations = violations.concat(checkDuplication(files, config));
  if (options.rules)
    violations = violations.filter((violation) =>
      options.rules.includes(violation.rule),
    );
  return { files, violations };
}
function gateFailed(failOn, summary, comparison) {
  if (failOn === "any") return summary.total > 0;
  if (failOn === "error") return summary.errors > 0;
  if (failOn === "regression")
    return comparison !== null && comparison.regressions.length > 0;
  return false;
}
export function run(options, config) {
  const { files, violations } = scan(options, config);
  const scanned = files.map((file) => file.rel);
  const sorted = sortViolations(violations);
  const summary = summarize(sorted);
  const comparison = comparisonFor(options, sorted, scanned);
  if (comparison.failed) return 3;
  writeBaselineIfRequested(options, sorted, scanned);
  const result = resultFor({
    options,
    files,
    sorted,
    summary,
    comparison: comparison.value,
  });
  writeResult(options, result);
  return gateFailed(options.failOn, summary, comparison.value) ? 1 : 0;
}
