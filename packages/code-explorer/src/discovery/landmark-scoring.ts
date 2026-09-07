import type { LandmarkCandidate } from "./landmark-candidate.js";
import type { LandmarkEvidence } from "./landmark-evidence.js";
import type { ScoredLandmark } from "./scored-landmark.js";

const minimumLandmarkScore = 5;

function productionReferences(candidate: LandmarkCandidate) {
  return candidate.references.filter(
    (reference) => reference.content === "production",
  );
}

function incomingCallCount(candidate: LandmarkCandidate): number {
  return candidate.incoming_call_sites?.length ?? 0;
}

function evidenceSource(
  candidate: LandmarkCandidate,
): LandmarkEvidence["sources"] {
  return {
    production_reference_files: "semantic_references",
    directory_spread: "semantic_references",
    incoming_call_sites: candidate.incoming_call_sites
      ? "incoming_call_hierarchy"
      : "unavailable",
    public_or_exported:
      candidate.public_or_exported === undefined
        ? "unavailable"
        : "semantic_visibility",
    test_only: "classification",
  };
}

function landmarkEvidence(candidate: LandmarkCandidate): LandmarkEvidence {
  const references = productionReferences(candidate);
  const productionReferenceFiles = new Set(
    references.map((reference) => reference.path),
  );
  const directorySpread = new Set(
    references
      .map((reference) => reference.path.split("/")[0])
      .filter((directory): directory is string => Boolean(directory)),
  ).size;
  return {
    production_reference_files: productionReferenceFiles.size,
    incoming_call_sites: incomingCallCount(candidate),
    directory_spread: directorySpread,
    public_or_exported: candidate.public_or_exported === true,
    test_only:
      candidate.references.some((reference) => reference.content === "test") &&
      productionReferenceFiles.size === 0,
    sources: evidenceSource(candidate),
  };
}

function scoreEvidence(evidence: LandmarkEvidence): number {
  return (
    3 * Math.min(evidence.production_reference_files, 10) +
    4 * Math.min(evidence.incoming_call_sites, 10) +
    2 * Math.min(evidence.directory_spread, 5) +
    (evidence.public_or_exported ? 5 : 0) -
    (evidence.test_only ? 20 : 0)
  );
}

/** Computes only observed ranking evidence. A missing backend result never
 * becomes inferred call evidence.
 */
export function scoreLandmark(candidate: LandmarkCandidate): ScoredLandmark {
  const evidence = landmarkEvidence(candidate);
  const score = scoreEvidence(evidence);
  return {
    ...candidate.symbol,
    evidence,
    score,
    eligible: !candidate.generated_only && score >= minimumLandmarkScore,
  };
}
