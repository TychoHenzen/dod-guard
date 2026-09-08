import type { BurstFileActivity } from "./types.js";

export function selectAbsoluteSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  return files.filter((file) => file.postBurstCommits >= 3);
}

function maximumPostBurstCommits(files: readonly BurstFileActivity[]): number {
  return Math.max(0, ...files.map((file) => file.postBurstCommits));
}

/** Selects files meeting the positive relative post-burst survivor threshold. */
export function selectRelativeSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return maximum > 0 ? files.filter((file) => file.postBurstCommits >= 0.2 * maximum) : [];
}

/** Selects files meeting either the absolute or positive relative survivor threshold. */
export function selectSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return files.filter((file) => file.postBurstCommits >= 3 || (maximum > 0 && file.postBurstCommits >= 0.2 * maximum));
}

/** Selects current burst files that meet neither survivor rule. */
export function selectFossilCandidates(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => file.existsAtHead && !survivors.has(file));
}

/** Selects deleted burst paths that meet neither survivor rule. */
export function selectDeletedNonSurvivorPaths(files: readonly BurstFileActivity[]): string[] {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => !(file.existsAtHead || survivors.has(file))).map((file) => file.path);
}
