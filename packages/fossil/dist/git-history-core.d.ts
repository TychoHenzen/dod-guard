/** Public compatibility boundary for Git history analysis. */
export { assertIncludedCommitLimit, DEFAULT_MAXIMUM_INCLUDED_COMMITS, nonMergeGitLogArguments, shallowHistoryWarnings, shallowRepositoryArguments, sparseCheckoutArguments, sparseCheckoutWarnings, } from "./git-history-contract.js";
export { emptyHistoryWarnings, futureCommitWarnings, sortCommitsChronologically } from "./git-history-order.js";
export { parseNonMergeGitLog } from "./git-history-stream.js";
export { filterHistoryByExtensions, normalizeExtensions } from "./git-history-extensions.js";
export { splitTemporalClusters } from "./git-history-temporal.js";
export { splitAtChangePoint } from "./git-history-change-point.js";
export { retainClosedTemporalClusters, retainQualifiedClosedClusters } from "./git-history-closure.js";
export { selectAbsoluteSurvivors, selectDeletedNonSurvivorPaths, selectFossilCandidates, selectRelativeSurvivors, selectSurvivors, } from "./git-history-survivors.js";
export { assembleClosedBursts } from "./git-history-bursts.js";
export { resolveRenameActivities } from "./git-history-identities.js";
