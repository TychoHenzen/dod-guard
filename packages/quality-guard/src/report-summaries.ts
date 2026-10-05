type ScoredFile = {
  high: number;
  medium: number;
  low: number;
  errors: number;
  warnings: number;
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
    errors: high,
    warnings: medium + low,
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
