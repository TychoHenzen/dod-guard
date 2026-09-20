import { EvidenceSchema } from "./schema.js";
import { findingsFor } from "./findings.js";
import { emptyMetrics, metricsFor } from "./metrics.js";
import { validateEvidence } from "./validate.js";

function invalidReport(errors: string[]) {
  return {
    schemaVersion: 1 as const,
    status: "invalid" as const,
    errors: [...new Set(errors)].sort(),
    findings: [],
    metrics: emptyMetrics(),
  };
}

export function analyzeTestQuality(value: unknown) {
  const parsed = EvidenceSchema.safeParse(value);
  if (!parsed.success)
    return invalidReport(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  const errors = validateEvidence(parsed.data);
  if (errors.length > 0) return invalidReport(errors);
  return {
    schemaVersion: 1 as const,
    status: "ok" as const,
    ...(parsed.data.environment
      ? { environment: parsed.data.environment }
      : {}),
    errors: [],
    findings: findingsFor(parsed.data),
    metrics: metricsFor(parsed.data),
  };
}
