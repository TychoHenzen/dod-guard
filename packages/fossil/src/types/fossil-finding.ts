import type { BurstFileActivity } from "./burst-file-activity.js";
import type { FindingClassification } from "./finding-classification.js";
import type { FossilSubscores } from "./fossil-subscores.js";
import type { ReferenceAvailability } from "./reference-availability.js";
import type { ScoreBasis } from "./score-basis.js";

export interface FossilFinding {
  readonly classification: FindingClassification;
  readonly burstId: string;
  readonly path: string;
  readonly activity: BurstFileActivity;
  readonly score: number;
  readonly scoreBasis: ScoreBasis;
  readonly subscores: FossilSubscores;
  readonly referenceAvailability: ReferenceAvailability;
  readonly strongInboundReferences: number;
  readonly candidateNeighbors: readonly string[];
  readonly liveNeighbors: readonly string[];
}
