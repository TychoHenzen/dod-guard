import { createHash } from "node:crypto";

export type FindingSeverity = "review" | "fail";
export type DecisionVerdict = "PASS" | "REVIEW_REQUIRED" | "FAIL";

export interface FindingEvidence {
  [key: string]: unknown;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  affectedPaths: string[];
  before: FindingEvidence;
  after: FindingEvidence;
  reason: string;
}

export interface SnapshotSummary {
  baseIdentity: string;
  targetIdentity: string;
  changedSourcePaths: string[];
  /** Present when the staged input requires no source-quality decision. */
  reason?: string;
}

export interface DecisionResult {
  verdict: DecisionVerdict;
  fingerprint?: string;
  findings: Finding[];
  errors: string[];
  input: SnapshotSummary;
}

export interface FindingInput {
  severity: FindingSeverity;
  affectedPaths: string[];
  before: FindingEvidence;
  after: FindingEvidence;
  reason: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createFinding(input: FindingInput): Finding {
  const affectedPaths = [...new Set(input.affectedPaths)].sort((left, right) => left.localeCompare(right));
  const identity = canonical({ ...input, affectedPaths });
  return { ...input, affectedPaths, id: createHash("sha256").update(identity).digest("hex") };
}

export function normalizeFindings(findings: Finding[]): Finding[] {
  return findings
    .map(({ id: _id, ...finding }) => createFinding(finding))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function failureResult(input: SnapshotSummary, error: string): DecisionResult {
  return { verdict: "FAIL", findings: [], errors: [error], input };
}
