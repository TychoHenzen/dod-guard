import { coverageMetrics } from "./coverage-metrics.js";
import { languageMetrics, sumMetrics } from "./language-metrics.js";
import { timingMetrics } from "./timing-metrics.js";
import type { Evidence } from "../types.js";

export { emptyMetrics } from "./metric-constants.js";

export function metricsFor(evidence: Evidence) {
  const languages = languageMetrics(evidence);
  return {
    languages,
    totals: sumMetrics(languages),
    coverage: coverageMetrics(evidence),
    timing: timingMetrics(evidence),
  };
}
