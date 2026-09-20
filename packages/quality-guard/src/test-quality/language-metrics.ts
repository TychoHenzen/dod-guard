import { activeTests } from "./finding.js";
import { behaviorStats, bugStats } from "./language-stats.js";
import { METRIC_KEYS } from "./metric-constants.js";
import type { Evidence } from "./types.js";

function normalizedLanguage(value: string): string {
  return (
    (
      {
        ".net": "csharp",
        cs: "csharp",
        csharp: "csharp",
        dotnet: "csharp",
        js: "typescript",
        net: "csharp",
        py: "python",
        python: "python",
        rs: "rust",
        rust: "rust",
        ts: "typescript",
        typescript: "typescript",
      } as Record<string, string>
    )[value.toLowerCase()] ?? value.toLowerCase()
  );
}

function sourcesForLanguage(evidence: Evidence, language: string) {
  return evidence.sources.filter(
    (source) => normalizedLanguage(source.language) === language,
  );
}

function testsForLanguage(evidence: Evidence, language: string) {
  return evidence.tests.filter(
    (test) => normalizedLanguage(test.language) === language,
  );
}

function coverageCount(evidence: Evidence, paths: Set<string>): number {
  return (evidence.coverage?.observations ?? []).filter((item) =>
    paths.has(item.sourcePath),
  ).length;
}

function failureCount(evidence: Evidence, paths: Set<string>): number {
  return (evidence.failures ?? []).filter(
    (item) => item.sourcePath && paths.has(item.sourcePath),
  ).length;
}

function languageMetric(evidence: Evidence, language: string) {
  const sources = sourcesForLanguage(evidence, language);
  const tests = testsForLanguage(evidence, language);
  const paths = new Set(sources.map((source) => source.path));
  const tested = (id: string) => activeTests(evidence, id).length > 0;
  const behaviors = behaviorStats(sources, tested);
  const bugs = bugStats(evidence, paths, tested);
  return {
    language,
    sourceCount: sources.length,
    testCount: tests.length,
    skippedTestCount: tests.filter((test) => test.status === "skipped").length,
    ...behaviors,
    ...bugs,
    coverageSourceCount: coverageCount(evidence, paths),
    failureCount: failureCount(evidence, paths),
  };
}

export function languageMetrics(evidence: Evidence) {
  const languages = new Set([
    ...evidence.sources.map((source) => normalizedLanguage(source.language)),
    ...evidence.tests.map((test) => normalizedLanguage(test.language)),
  ]);
  return [...languages]
    .sort()
    .map((language) => languageMetric(evidence, language));
}

export function sumMetrics(metrics: ReturnType<typeof languageMetric>[]) {
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [
      key,
      metrics.reduce((sum, item) => sum + item[key], 0),
    ]),
  );
}
