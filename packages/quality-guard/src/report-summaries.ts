import type { requireSeverity } from "#quality-guard-severity";

type ScoredFile = {
  high: number;
  medium: number;
  low: number;
  score: number;
  classification: "production" | "test";
};

function summarize(files: ScoredFile[]) {
  const fileCount = files.length;
  const high = files.reduce((sum, file) => sum + file.high, 0);
  const medium = files.reduce((sum, file) => sum + file.medium, 0);
  const low = files.reduce((sum, file) => sum + file.low, 0);
  const scores = files.map((file) => file.score);
  return {
    fileCount,
    high,
    medium,
    low,
    averageScore:
      fileCount === 0
        ? null
        : scores.reduce((sum, score) => sum + score, 0) / fileCount,
    minimumScore: fileCount === 0 ? null : Math.min(...scores),
  };
}

export function reportSummaries(
  files: ScoredFile[],
  projectFindings: ReadonlyArray<{
    severity: ReturnType<typeof requireSeverity>;
  }>,
) {
  const production = files.filter(
    (file) => file.classification === "production",
  );
  const tests = files.filter((file) => file.classification === "test");
  const project = severityCounts(projectFindings);
  const overall = summarize(files);
  return {
    overall: {
      ...overall,
      high: overall.high + project.high,
      medium: overall.medium + project.medium,
      low: overall.low + project.low,
    },
    production: summarize(production),
    test: summarize(tests),
    project: { findingCount: projectFindings.length, ...project },
  };
}

export function severityCounts(
  findings: ReadonlyArray<{ severity: ReturnType<typeof requireSeverity> }>,
) {
  return {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };
}
