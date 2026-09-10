export interface QualityConfig {
  pathGroups: Record<string, string[]>;
  dependencyDirections: Array<{ from: string; to: string; allowed: boolean }>;
  directTypeLimit: number;
  genericBuckets: string[];
  generatedPaths: string[];
  testPaths: string[];
  history: { maxFirstParentCommits: number };
}

export const DEFAULT_CONFIG: QualityConfig = {
  pathGroups: {},
  dependencyDirections: [],
  directTypeLimit: 12,
  genericBuckets: ["utils", "common", "helpers", "shared", "misc"],
  generatedPaths: [],
  testPaths: [],
  history: { maxFirstParentCommits: 200 },
};
