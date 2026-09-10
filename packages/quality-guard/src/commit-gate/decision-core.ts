import { collectFindings } from "./decision-findings.js";
import { DECISION_RECORD_PATH, fingerprintSnapshot } from "./fingerprint.js";
import { evaluateResponsibilityMap } from "./responsibility-map.js";
import type { Snapshot } from "./snapshot.js";
import { type DecisionResult } from "./types.js";
import type { DecisionCoreInput } from "./decision-core-types.js";
import {
  changedSourcePaths,
  noDecision,
  requiresSourceDecision,
  summaryFor,
} from "./decision-core-summary.js";
function acceptedFindings(input: DecisionCoreInput, fingerprint: string) {
  const current = (input.acknowledgementRecords ?? []).filter(
    (record) => record.fingerprint === fingerprint,
  );
  return new Set([
    ...(input.acknowledgements ?? []),
    ...current.map((record) => record.findingId),
  ]);
}
function progressFor(input: DecisionCoreInput) {
  if (!input.refactorMap) return undefined;
  return evaluateResponsibilityMap(input.refactorMap, {
    before: input.beforeFiles,
    after: input.afterFiles,
    config: input.config,
  });
}
function analysisErrors(input: DecisionCoreInput): string[] {
  return [
    ...(input.scanner.errors ?? []),
    ...(input.analysisErrors ?? []),
  ].sort((left, right) => left.localeCompare(right));
}
function staleAcknowledgements(
  input: DecisionCoreInput,
  fingerprint: string,
): string[] {
  return (input.acknowledgementRecords ?? [])
    .filter((record) => record.fingerprint !== fingerprint)
    .map((record) => record.findingId)
    .sort();
}
function verdict(
  errors: string[],
  findings: DecisionResult["findings"],
  accepted: Set<string>,
): DecisionResult["verdict"] {
  if (
    errors.length > 0 ||
    findings.some((finding) => finding.severity === "fail")
  )
    return "FAIL";
  return findings.some(
    (finding) => finding.severity === "review" && !accepted.has(finding.id),
  )
    ? "REVIEW_REQUIRED"
    : "PASS";
}
export function decideQuality(input: DecisionCoreInput): DecisionResult {
  const affectedPaths = changedSourcePaths(input.snapshot);
  const summary = summaryFor(input.snapshot, affectedPaths);
  if (!requiresSourceDecision(input.snapshot)) return noDecision(summary);
  const refactorProgress = progressFor(input);
  const findings = collectFindings({
    ...input,
    affectedPaths,
    refactorProgress,
  });
  const fingerprint = fingerprintSnapshot(input.snapshot, input.config);
  const errors = analysisErrors(input);
  return {
    verdict: verdict(errors, findings, acceptedFindings(input, fingerprint)),
    fingerprint,
    findings,
    errors,
    input: summary,
    staleAcknowledgements: staleAcknowledgements(input, fingerprint),
    refactorProgress,
  };
}
export { DECISION_RECORD_PATH };
