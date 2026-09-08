/** Public compatibility boundary for fossil scoring. */
export {
  abandonmentScore,
  candidateReferenceSubscores,
  clusterIsolationScore,
  createAdvisoryFossilFinding,

  meetsFossilThreshold,
  normalizedBurstChurn,
  qualifyingBurstCandidates,
  referenceWeaknessScore,
  scoreFossilSubscores,
} from "./fossil-scoring-core.js";
export type {
  AdvisoryFossilFindingInput,
  BurstCandidateEvidence,
  CandidateReferenceSubscores,
  FossilScore,
} from "./fossil-scoring-core.js";
