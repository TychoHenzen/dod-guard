import type { DecisionResult } from "./types.js";

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
  lines.push(
    ...result.findings.map(
      (finding) =>
        `${finding.severity.toUpperCase()}: ${finding.reason} (${finding.id})`,
    ),
  );
  lines.push(
    ...(result.staleAcknowledgements ?? []).map((findingId) =>
      [
        "STALE: acknowledgement for",
        findingId,
        "does not match the current staged fingerprint",
      ].join(" "),
    ),
  );
  lines.push(...refactorLines(result));
  return lines;
}

export function exitCodeFor(result: DecisionResult): number {
  if (result.verdict === "PASS") return 0;
  if (result.verdict === "FAIL") return 1;
  return 2;
}

export function renderDecision(result: DecisionResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  return decisionLines(result).join("\n");
}
