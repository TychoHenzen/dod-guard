/** Public compatibility boundary for Git history analysis. */
export {
  assembleClosedBursts,
  assertIncludedCommitLimit,
  DEFAULT_MAXIMUM_INCLUDED_COMMITS,
  emptyHistoryWarnings,

  filterHistoryByExtensions,
  futureCommitWarnings,
  normalizeExtensions,
  nonMergeGitLogArguments,
  parseNonMergeGitLog,
  retainClosedTemporalClusters,
  retainQualifiedClosedClusters,
  resolveRenameActivities,
  selectAbsoluteSurvivors,

  selectDeletedNonSurvivorPaths,
  selectFossilCandidates,
  selectRelativeSurvivors,
  selectSurvivors,
  shallowHistoryWarnings,

  shallowRepositoryArguments,
  sortCommitsChronologically,
  sparseCheckoutArguments,

  sparseCheckoutWarnings,
  splitAtChangePoint,
  splitTemporalClusters,
} from "./git-history-core.js";
