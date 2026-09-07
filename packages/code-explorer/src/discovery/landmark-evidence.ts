import type { LandmarkEvidenceSource } from "./landmark-evidence-source.js";

export type LandmarkEvidence = {
  production_reference_files: number;
  incoming_call_sites: number;
  directory_spread: number;
  public_or_exported: boolean;
  test_only: boolean;
  sources: {
    production_reference_files: LandmarkEvidenceSource;
    incoming_call_sites: LandmarkEvidenceSource;
    directory_spread: LandmarkEvidenceSource;
    public_or_exported: LandmarkEvidenceSource;
    test_only: LandmarkEvidenceSource;
  };
};
