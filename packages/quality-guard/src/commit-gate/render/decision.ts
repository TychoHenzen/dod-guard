import type { DecisionResult } from "../types.js";
import { scannerLines } from "./scanner.js";

function refactorLines(result: DecisionResult): string[] {
  if (!result.refactorProgress) return [];
  return Object.entries(result.refactorProgress.indicators).map(
    ([name, indicator]) =>
      `REFACTOR: ${name} ${indicator.status} ` +
      `(${indicator.before} -> ${indicator.after})`,
  );
}

function decisionLines(result: DecisionResult): string[] {
  const lines: string[] = [result.verdict];
  if (result.input.reason) lines.push(result.input.reason);
  lines.push(...result.errors.map((error) => `ERROR: ${error}`));
  lines.push(...findingLines(result));
  lines.push(...scannerLines(result));
  lines.push(...staleLines(result));
  lines.push(...refactorLines(result));
  return lines;
}

function findingLines(result: DecisionResult): string[] {
  return result.findings.map(
    (finding) =>
      `${finding.severity.toUpperCase()}: ${finding.reason} (${finding.id})`,
  );
}

function staleLines(result: DecisionResult): string[] {
  return (result.staleAcknowledgements ?? []).map((record) =>
    [
      "STALE: acknowledgement for",
      record.findingId,
      "is bound to base",
      record.baseIdentity ?? "unknown",
      "and target",
      record.targetIdentity ?? "unknown",
      "; current snapshot is base",
      result.input.baseIdentity,
      "and target",
      result.input.targetIdentity,
    ].join(" "),
  );
}

export function exitCodeFor(result: DecisionResult): number {
  if (result.verdict === "PASS") return 0;
  if (result.verdict === "FAIL") return 1;
  return 2;
}

export function renderDecision(
  result: DecisionResult,
  options: { json: boolean },
): string {
  if (options.json) return JSON.stringify(result, null, 2);
  return decisionLines(result).join("\n");
}
