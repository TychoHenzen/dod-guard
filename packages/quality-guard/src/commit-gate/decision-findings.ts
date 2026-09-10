import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { structuralFindings } from "./decision-findings-architecture.js";
import type { ResponsibilityMap } from "./responsibility-map.js";
import {
  createFinding,
  type DecisionResult,
  normalizeFindings,
} from "./types.js";

function progressFindings(
  progress: { hasDeclaredOutcomeProgress: boolean } | undefined,
  refactorMap: ResponsibilityMap | undefined,
  affectedPaths: string[],
): DecisionResult["findings"] {
  if (!progress || progress.hasDeclaredOutcomeProgress) return [];
  return [
    createFinding({
      severity: "review",
      affectedPaths: refactorMap?.targetScope ?? affectedPaths,
      before: {},
      after: { ...progress },
      reason:
        "refactor-structural-progress: declared ownership or boundary " +
        "outcome is unchanged",
    }),
  ];
}

type CollectInput = {
  scanner: { findings: Array<Omit<DecisionResult["findings"][number], "id">> };
  hardBounds?: Array<Omit<DecisionResult["findings"][number], "id">>;
  responsibilityFindings?: Array<
    Omit<DecisionResult["findings"][number], "id">
  >;
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
  refactorProgress: { hasDeclaredOutcomeProgress: boolean } | undefined;
  refactorMap?: ResponsibilityMap;
};

export function collectFindings(
  input: CollectInput,
): DecisionResult["findings"] {
  return normalizeFindings([
    ...input.scanner.findings.map(createFinding),
    ...(input.hardBounds ?? []).map(createFinding),
    ...(input.responsibilityFindings ?? []).map(createFinding),
    ...structuralFindings(input),
    ...progressFindings(
      input.refactorProgress,
      input.refactorMap,
      input.affectedPaths,
    ),
  ]);
}
