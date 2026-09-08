import type { FossilReport, NormalizedAnalysisOptions } from "../types.js";
import type { AdvisoryFossilFindingInput } from "../fossil-grader.js";
import {
  defaultCompleteness,
  defaultLimits,
  defaultStatistics,
  defaultUsage,
} from "./report-defaults.js";

export function optionsFor(
  format: NormalizedAnalysisOptions["format"] = "table",
): NormalizedAnalysisOptions {
  return {
    days: 90,
    gapHours: 48,
    threshold: 0.4,
    format,
    extensions: [],
    untrackedAgeDays: 90,
    exclude: [],
    verbose: false,
  };
}

function advisoryActivity(input: {
  path: string;
  burstId: string;
  burstCommits: number;
}) {
  return {
    identity: `${input.burstId}:${input.path}`,
    path: input.path,
    burstCommits: input.burstCommits,
    postBurstCommits: 0,
    createdInBurst: true,
    existsAtHead: true,
  };
}

function advisorySubscores() {
  return {
    churn: 1,
    abandonment: 1,
    referenceWeakness: 1,
    clusterIsolation: 1,
  };
}

export function advisoryFindingInput(input: {
  path: string;
  burstId: string;
  score: number;
  burstCommits: number;
}): AdvisoryFossilFindingInput {
  return {
    burstId: input.burstId,
    path: input.path,
    activity: advisoryActivity(input),
    score: input.score,
    scoreBasis: "full",
    subscores: advisorySubscores(),
    referenceAvailability: "complete",
    strongInboundReferences: 0,
    candidateNeighbors: [],
    liveNeighbors: [],
  };
}

export function createReport(
  options: NormalizedAnalysisOptions,
  overrides: Partial<FossilReport> = {},
): FossilReport {
  return {
    schemaVersion: 1,
    options,
    analysisTimestampMs: 0,
    gitVersion: "2.47.0",
    boundary: {
      repositoryRoot: "C:/repo",
      canonicalRepositoryRoot: "C:/repo",
      unobservedMechanisms: [],
    },
    limits: { ...defaultLimits },
    usage: { ...defaultUsage },
    completeness: { ...defaultCompleteness },
    statistics: { ...defaultStatistics },
    warnings: [],
    bursts: [],
    workspaceDebris: [],
    ...overrides,
  };
}
