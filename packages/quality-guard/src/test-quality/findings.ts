import { behaviorFindings } from "./behavior-findings.js";
import { evidenceFindings } from "./evidence-findings.js";
import { runtimeFindings } from "./runtime-findings.js";
import type { Evidence } from "./types.js";

export function findingsFor(evidence: Evidence) {
  return [
    ...behaviorFindings(evidence),
    ...evidenceFindings(evidence),
    ...runtimeFindings(evidence),
  ].sort(
    (left, right) =>
      left.heuristic.localeCompare(right.heuristic) ||
      left.path.localeCompare(right.path) ||
      left.message.localeCompare(right.message),
  );
}
