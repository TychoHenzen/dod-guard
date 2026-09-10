import {
  adoptNewFiles,
  buildBaseline,
  compareToBaseline,
  readBaseline,
  writeBaseline,
} from "./lib/baseline.mjs";
import { renderJson, renderText, toWorkUnits } from "./lib/report.mjs";

function compareAndAdopt(path, violations, scanned) {
  let baseline;
  try {
    baseline = readBaseline(path);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return null;
  }
  const comparison = compareToBaseline(violations, baseline, scanned);
  if (comparison.adopted.length > 0)
    writeBaseline(
      path,
      adoptNewFiles(baseline, violations, comparison.adopted),
    );
  return comparison;
}

export function resultFor({ options, files, sorted, summary, comparison }) {
  return {
    profile: options.profile,
    fileCount: files.length,
    files: files
      .map((file) => ({
        path: file.rel,
        language: file.lang,
        classification: file.isTest ? "test" : "production",
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    summary,
    comparison,
    violations: sorted,
  };
}

export function comparisonFor(options, sorted, scanned) {
  if (!options.baseline) return { failed: false, value: null };
  const value = compareAndAdopt(options.baseline, sorted, scanned);
  return { failed: value === null, value };
}

export function writeBaselineIfRequested(options, sorted, scanned) {
  if (options.writeBaseline)
    writeBaseline(
      options.writeBaseline,
      buildBaseline(sorted, options.profile, scanned),
    );
}

function resultText(options, result) {
  switch (options.format) {
    case "json":
      return renderJson(result);
    case "units":
      return renderJson({ ...result, units: toWorkUnits(result.violations) });
    default:
      return renderText(result, options.top);
  }
}

export function writeResult(options, result) {
  process.stdout.write(resultText(options, result) + "\n");
}
