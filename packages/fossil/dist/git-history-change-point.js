import { fileIdentities, prepareWeightedSimilarity, } from "./git-history-change-point-scoring.js";
import { splitChangePoints } from "./git-history-change-point-search.js";
export { partitionQualifies } from "./git-history-change-point-scoring.js";
/** Splits qualifying close file-set changes chronologically. */
export function splitAtChangePoint(commits) {
    if (commits.length === 0)
        return [];
    const identities = fileIdentities(commits);
    const similarityInput = prepareWeightedSimilarity(commits, identities);
    return splitChangePoints({
        commits,
        start: 0,
        end: commits.length,
        identities,
    }, similarityInput);
}
//# sourceMappingURL=git-history-change-point.js.map