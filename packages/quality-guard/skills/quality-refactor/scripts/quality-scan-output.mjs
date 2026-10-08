import { renderJson, renderText, toWorkUnits } from "./lib/report.mjs";

export function resultFor({ files, sorted, summary }) {
  return {
    fileCount: files.length,
    files: files
      .map((file) => ({
        path: file.rel,
        language: file.lang,
        classification: file.isTest ? "test" : "production",
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    summary,
    comparison: null,
    violations: sorted,
  };
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
