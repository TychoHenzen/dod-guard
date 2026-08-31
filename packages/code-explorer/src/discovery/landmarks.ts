export type LandmarkDiscovery = {
  state: "ready" | "landmarks_not_ready";
  landmarks: readonly LandmarkGroup[];
};

export type LandmarkSymbol = {
  symbol_id: string;
  name: string;
  path: string;
  kind: string;
};

export type LandmarkEvidenceSource =
  | "semantic_references"
  | "incoming_call_hierarchy"
  | "semantic_visibility"
  | "classification"
  | "unavailable";

export type LandmarkReference = { path: string; content: "production" | "test" | "generated" | "unknown" };

export type LandmarkCandidate = {
  symbol: LandmarkSymbol;
  references: readonly LandmarkReference[];
  incoming_call_sites?: readonly string[];
  public_or_exported?: boolean;
  generated_only?: boolean;
  entry_point?: boolean;
};

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

export type ScoredLandmark = LandmarkSymbol & {
  evidence: LandmarkEvidence;
  score: number;
  eligible: boolean;
};

export type LandmarkGroup = {
  group: string;
  symbols: readonly LandmarkSymbol[];
  omitted_candidate_count?: number;
};

export const landmarkGroupNames = [
  "messages_or_events",
  "services",
  "entry_points",
  "types",
  "common_actions",
] as const;
export type LandmarkGroupName = (typeof landmarkGroupNames)[number];
export type LandmarkAnalysisGroup = {
  group: LandmarkGroupName;
  candidates: readonly ScoredLandmark[];
  omitted_candidate_count: number;
};

const MAX_LANDMARK_GROUPS = 5;
const MAX_LANDMARKS_PER_GROUP = 12;
const MINIMUM_LANDMARK_SCORE = 5;
const DEFAULT_GROUP_LIMIT = 12;
const MAX_GROUP_LIMIT = 50;
const messageOrEventSuffixes = ["event", "message", "command", "request", "response"];
const serviceSuffixes = ["service", "manager", "controller", "repository", "provider", "client"];
const typeKinds = new Set(["class", "enum", "interface", "record", "struct", "type"]);
const callableKinds = new Set(["constructor", "function", "method"]);

/** Computes only observed ranking evidence. A missing backend result never becomes inferred call evidence. */
export function scoreLandmark(candidate: LandmarkCandidate): ScoredLandmark {
  const productionReferences = candidate.references.filter((reference) => reference.content === "production");
  const productionReferenceFiles = new Set(productionReferences.map((reference) => reference.path)).size;
  const directorySpread = new Set(
    productionReferences
      .map((reference) => reference.path.split("/")[0])
      .filter((directory): directory is string => Boolean(directory)),
  ).size;
  const testOnly = candidate.references.some((reference) => reference.content === "test") && productionReferenceFiles === 0;
  const incomingCallSites = candidate.incoming_call_sites?.length ?? 0;
  const publicOrExported = candidate.public_or_exported === true;
  const evidence: LandmarkEvidence = {
    production_reference_files: productionReferenceFiles,
    incoming_call_sites: incomingCallSites,
    directory_spread: directorySpread,
    public_or_exported: publicOrExported,
    test_only: testOnly,
    sources: {
      production_reference_files: "semantic_references",
      directory_spread: "semantic_references",
      incoming_call_sites: candidate.incoming_call_sites ? "incoming_call_hierarchy" : "unavailable",
      public_or_exported: candidate.public_or_exported === undefined ? "unavailable" : "semantic_visibility",
      test_only: "classification",
    },
  };
  const score =
    3 * Math.min(evidence.production_reference_files, 10) +
    4 * Math.min(evidence.incoming_call_sites, 10) +
    2 * Math.min(evidence.directory_spread, 5) +
    (evidence.public_or_exported ? 5 : 0) -
    (evidence.test_only ? 20 : 0);
  return {
    ...candidate.symbol,
    evidence,
    score,
    eligible: !candidate.generated_only && score >= MINIMUM_LANDMARK_SCORE,
  };
}

/** Ranks candidates by the declared score while retaining failed candidates for explainable comparison. */
export function rankLandmarks(candidates: readonly LandmarkCandidate[]): ScoredLandmark[] {
  return candidates.map(scoreLandmark).sort((left, right) => right.score - left.score);
}

/** Leaves generated-only identities out of the default selectable set and keeps the score threshold at the boundary. */
export function defaultLandmarks(candidates: readonly LandmarkCandidate[]): ScoredLandmark[] {
  return rankLandmarks(candidates).filter((landmark) => landmark.eligible);
}

/** Groups eligible landmarks by literal whole-name suffixes and bounds each independent result list. */
export function groupLandmarks(
  candidates: readonly LandmarkCandidate[],
  perGroupLimit = DEFAULT_GROUP_LIMIT,
): LandmarkAnalysisGroup[] {
  if (perGroupLimit > MAX_GROUP_LIMIT) throw new RangeError("landmark_group_limit_exceeded");
  const scoredCandidates = candidates
    .map((candidate) => ({ candidate, landmark: scoreLandmark(candidate) }))
    .filter(({ landmark }) => landmark.eligible)
    .sort((left, right) => right.landmark.score - left.landmark.score);
  return landmarkGroupNames.flatMap((group) => {
    const matches = scoredCandidates
      .filter(({ candidate }) => landmarkGroupFor(candidate) === group)
      .map(({ landmark }) => landmark);
    return matches.length
      ? [{ group, candidates: matches.slice(0, perGroupLimit), omitted_candidate_count: Math.max(0, matches.length - perGroupLimit) }]
      : [];
  });
}

/** Converts grouped analysis into the empty-search response shape without dropping evidence or omitted counts. */
export function readyGroupedLandmarks(
  candidates: readonly LandmarkCandidate[],
  perGroupLimit = DEFAULT_GROUP_LIMIT,
): LandmarkDiscovery {
  return {
    state: "ready",
    landmarks: groupLandmarks(candidates, perGroupLimit).map((group) => ({
      group: group.group,
      symbols: group.candidates,
      omitted_candidate_count: group.omitted_candidate_count,
    })),
  };
}

function landmarkGroupFor(candidate: LandmarkCandidate): LandmarkGroupName | undefined {
  const normalizedName = candidate.symbol.name.normalize("NFKC").toLocaleLowerCase();
  const type = typeKinds.has(candidate.symbol.kind.normalize("NFKC").toLocaleLowerCase());
  const callable = callableKinds.has(candidate.symbol.kind.normalize("NFKC").toLocaleLowerCase());
  if (type && messageOrEventSuffixes.some((suffix) => normalizedName.endsWith(suffix))) return "messages_or_events";
  if (type && serviceSuffixes.some((suffix) => normalizedName.endsWith(suffix))) return "services";
  if (callable && (candidate.entry_point === true || normalizedName === "main")) return "entry_points";
  if (type) return "types";
  if (callable) return "common_actions";
  return undefined;
}

/** Keeps precomputed landmark identities selectable while later analysis owns their score and classification. */
export function readyLandmarks(groups: readonly LandmarkGroup[]): LandmarkDiscovery {
  return {
    state: "ready",
    landmarks: groups.slice(0, MAX_LANDMARK_GROUPS).map((group) => ({
      group: group.group,
      symbols: group.symbols.slice(0, MAX_LANDMARKS_PER_GROUP),
      ...(group.omitted_candidate_count === undefined ? {} : { omitted_candidate_count: group.omitted_candidate_count }),
    })),
  };
}

/** Keeps empty-query routing separate from ordinary symbol and file matching. */
export function landmarksNotReady(): LandmarkDiscovery {
  return { state: "landmarks_not_ready", landmarks: [] };
}
