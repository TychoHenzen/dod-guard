import type { ArchitectureAcknowledgement } from "./acknowledgements.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { QualityConfig } from "./config.js";
import type { ResponsibilityMap } from "./responsibility-map.js";
import type { Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";

export interface DecisionCoreInput {
  snapshot: Snapshot;
  config: QualityConfig;
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  scanner: {
    findings: Array<Omit<DecisionResult["findings"][number], "id">>;
    errors?: string[];
  };
  hardBounds?: Array<Omit<DecisionResult["findings"][number], "id">>;
  analysisErrors?: string[];
  responsibilityFindings?: Array<
    Omit<DecisionResult["findings"][number], "id">
  >;
  acknowledgements?: string[];
  acknowledgementRecords?: ArchitectureAcknowledgement[];
  refactorMap?: ResponsibilityMap;
}
