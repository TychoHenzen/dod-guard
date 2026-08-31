import type { ArchitectureAcknowledgement } from "./acknowledgements.js";
import type { QualityConfig } from "./config.js";
import { analyzeDependencies, type DependencyFinding } from "./dependency.js";
import { type ArchitectureFileFact, analyzeEncapsulation, type EncapsulationFinding } from "./encapsulation.js";
import { DECISION_RECORD_PATH, fingerprintSnapshot } from "./fingerprint.js";
import { analyzePlacement, type PlacementFinding } from "./placement.js";
import { evaluateResponsibilityMap, type ResponsibilityMap } from "./responsibility-map.js";
import type { Snapshot } from "./snapshot.js";
import {
  createFinding,
  type DecisionResult,
  type Finding,
  type FindingEvidence,
  type FindingInput,
  normalizeFindings,
} from "./types.js";

const SOURCE_PATH = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i;
const QUALITY_CONFIGURATION_PATH = ".quality-guard.json";

export interface ScannerEvidence {
  findings: FindingInput[];
  errors?: string[];
}

export interface DecisionCoreInput {
  snapshot: Snapshot;
  config: QualityConfig;
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  scanner: ScannerEvidence;
  hardBounds?: FindingInput[];
  analysisErrors?: string[];
  responsibilityFindings?: FindingInput[];
  acknowledgements?: string[];
  acknowledgementRecords?: ArchitectureAcknowledgement[];
  refactorMap?: ResponsibilityMap;
}

function changedPaths(snapshot: Snapshot): string[] {
  return [
    ...new Set(
      snapshot.changes
        .flatMap((change) => [change.before?.path, change.after?.path])
        .filter((path): path is string => Boolean(path)),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function sourcePaths(snapshot: Snapshot): string[] {
  return changedPaths(snapshot).filter((filePath) => SOURCE_PATH.test(filePath));
}

function requiresSourceDecision(snapshot: Snapshot): boolean {
  return changedPaths(snapshot).some(
    (filePath) => SOURCE_PATH.test(filePath) || filePath === QUALITY_CONFIGURATION_PATH,
  );
}

function architectureFinding(
  kind: string,
  severity: "review" | "fail",
  affectedPaths: string[],
  evidence: FindingEvidence,
  reason: string,
): Finding {
  return createFinding({ severity, affectedPaths, before: {}, after: evidence, reason: `${kind}: ${reason}` });
}

function placementFindings(findings: PlacementFinding[]): Finding[] {
  return findings.map((finding) =>
    architectureFinding(finding.kind, "review", [finding.directory], { ...finding }, "placement pressure increased"),
  );
}

function dependencyFindings(findings: DependencyFinding[]): Finding[] {
  return findings.map((finding) => {
    const paths = finding.kind === "cycle" ? finding.cycle : [finding.from, finding.to];
    return architectureFinding(
      finding.kind,
      "fail",
      paths,
      finding,
      "a deterministic dependency boundary was introduced",
    );
  });
}

function encapsulationFindings(findings: EncapsulationFinding[]): Finding[] {
  return findings.map((finding) =>
    architectureFinding(finding.kind, "review", [finding.path], finding, "public or compatibility surface changed"),
  );
}

/**
 * Combines the evidence families into the one authoritative verdict. Callers
 * provide complete before and after inventories, so the architecture analyzers
 * can see callers and dependencies outside the changed files.
 */
export function decideQuality(input: DecisionCoreInput): DecisionResult {
  const affectedPaths = sourcePaths(input.snapshot);
  const summary = {
    baseIdentity: input.snapshot.baseIdentity,
    targetIdentity: input.snapshot.targetIdentity,
    changedSourcePaths: affectedPaths,
  };
  if (!requiresSourceDecision(input.snapshot)) {
    return {
      verdict: "PASS",
      findings: [],
      errors: [],
      input: {
        ...summary,
        reason:
          "No source quality decision was required because the staged change contains no supported source or quality configuration.",
      },
    };
  }

  const refactorProgress = input.refactorMap
    ? evaluateResponsibilityMap(input.refactorMap, input.beforeFiles, input.afterFiles, input.config)
    : undefined;
  const findings = [
    ...input.scanner.findings.map(createFinding),
    ...(input.hardBounds ?? []).map(createFinding),
    ...(input.responsibilityFindings ?? []).map(createFinding),
    ...placementFindings(
      analyzePlacement(
        input.beforeFiles.map((file) => ({ path: file.path, types: file.types.map((type) => type.name) })),
        input.afterFiles.map((file) => ({ path: file.path, types: file.types.map((type) => type.name) })),
        affectedPaths,
        input.config,
      ),
    ),
    ...dependencyFindings(analyzeDependencies(input.beforeFiles, input.afterFiles, affectedPaths, input.config)),
    ...encapsulationFindings(analyzeEncapsulation(input.beforeFiles, input.afterFiles, affectedPaths, input.config)),
    ...(refactorProgress && !refactorProgress.hasDeclaredOutcomeProgress
      ? [
          architectureFinding(
            "refactor-structural-progress",
            "review",
            input.refactorMap?.targetScope ?? affectedPaths,
            { ...refactorProgress },
            "declared ownership or boundary outcome is unchanged",
          ),
        ]
      : []),
  ];
  const normalized = normalizeFindings(findings);
  const fingerprint = fingerprintSnapshot(input.snapshot, input.config);
  const currentRecords = (input.acknowledgementRecords ?? []).filter((record) => record.fingerprint === fingerprint);
  const accepted = new Set([...(input.acknowledgements ?? []), ...currentRecords.map((record) => record.findingId)]);
  const staleAcknowledgements = (input.acknowledgementRecords ?? [])
    .filter((record) => record.fingerprint !== fingerprint)
    .map((record) => record.findingId)
    .sort();
  const errors = [...(input.scanner.errors ?? []), ...(input.analysisErrors ?? [])].sort((left, right) =>
    left.localeCompare(right),
  );
  const hasFailure = errors.length > 0 || normalized.some((finding) => finding.severity === "fail");
  const hasUnacknowledgedReview = normalized.some(
    (finding) => finding.severity === "review" && !accepted.has(finding.id),
  );
  return {
    verdict: hasFailure ? "FAIL" : hasUnacknowledgedReview ? "REVIEW_REQUIRED" : "PASS",
    fingerprint,
    findings: normalized,
    errors,
    input: summary,
    staleAcknowledgements,
    refactorProgress,
  };
}

export { DECISION_RECORD_PATH };
