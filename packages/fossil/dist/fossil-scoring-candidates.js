/** Normalizes positive burst churn against the positive burst maximum. */
export function normalizedBurstChurn(candidate, burstFiles) {
    const maximumBurstCommits = Math.max(0, ...burstFiles.map((activity) => activity.burstCommits));
    if (maximumBurstCommits === 0)
        return 0;
    return Math.max(0, candidate.burstCommits) / maximumBurstCommits;
}
/** Scores the absence of post-burst commits for one candidate. */
export function abandonmentScore(candidate) {
    if (candidate.burstCommits <= 0)
        return 0;
    return Math.max(0, 1 - candidate.postBurstCommits / candidate.burstCommits);
}
/** Returns whether a score meets the inclusive fossil finding threshold. */
export function meetsFossilThreshold(score, threshold) {
    return score >= threshold;
}
/** Retains every qualifying burst candidate without deduplicating paths. */
export function qualifyingBurstCandidates(candidates, threshold) {
    return candidates.filter((candidate) => meetsFossilThreshold(candidate.score.score, threshold));
}
/** Builds a fossil finding that remains advisory regardless of its score. */
export function createAdvisoryFossilFinding(input) {
    return { ...input, classification: "advisory" };
}
//# sourceMappingURL=fossil-scoring-candidates.js.map