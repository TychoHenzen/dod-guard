/** Public compatibility boundary for Git history analysis. */
export * from "./repository-analysis-history-boundary.js";
export { assertIncludedCommitLimit, DEFAULT_MAXIMUM_INCLUDED_COMMITS, selectAbsoluteSurvivors, selectRelativeSurvivors, sortCommitsChronologically, splitAtChangePoint, } from "./git-history-core.js";
