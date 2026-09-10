type ScoredFile = {
  errors: number;
  warnings: number;
  score: number;
  classification: "production" | "test";
};

function summarize(files: ScoredFile[]) {
  const fileCount = files.length;
  const errors = files.reduce((sum, file) => sum + file.errors, 0);
  const warnings = files.reduce((sum, file) => sum + file.warnings, 0);
  const scores = files.map((file) => file.score);
  return {
    fileCount,
    errors,
    warnings,
    averageScore:
      fileCount === 0
        ? null
        : scores.reduce((sum, score) => sum + score, 0) / fileCount,
    minimumScore: fileCount === 0 ? null : Math.min(...scores),
  };
}

export function reportSummaries(files: ScoredFile[]) {
  const production = files.filter(
    (file) => file.classification === "production",
  );
  const tests = files.filter((file) => file.classification === "test");
  return {
    overall: summarize(files),
    production: summarize(production),
    test: summarize(tests),
  };
}
