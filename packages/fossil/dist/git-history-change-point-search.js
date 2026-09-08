import { partitionQualifies, weightedSimilarity, } from "./git-history-change-point-scoring.js";
const MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1_000;
const MAX_CHANGE_POINT_SIMILARITY = 0.1;
function validChangePoint({ commits, cut, start, end, identities, }) {
    const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
    return (gapMilliseconds >= MIN_CHANGE_POINT_GAP_MS &&
        partitionQualifies(commits.slice(start, cut), identities) &&
        partitionQualifies(commits.slice(cut, end), identities));
}
function compareChangePoints(left, right) {
    return (left.similarity - right.similarity ||
        right.gapMilliseconds - left.gapMilliseconds ||
        left.cut - right.cut);
}
function selectChangePoint(input, similarityInput) {
    const { commits, start, end, identities } = input;
    const candidates = [];
    for (let cut = start + 5; cut <= end - 5; cut += 1) {
        if (!validChangePoint({ commits, cut, start, end, identities }))
            continue;
        const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
        const similarity = weightedSimilarity(similarityInput, cut);
        if (similarity <= MAX_CHANGE_POINT_SIMILARITY)
            candidates.push({ cut, gapMilliseconds, similarity });
    }
    return candidates.sort(compareChangePoints)[0];
}
export function splitChangePoints(input, similarityInput) {
    const { commits, start, end, identities } = input;
    const candidate = selectChangePoint({ commits, start, end, identities }, similarityInput);
    if (!candidate)
        return [commits.slice(start, end)];
    return [
        ...splitChangePoints({ commits, start, end: candidate.cut, identities }, similarityInput),
        ...splitChangePoints({ commits, start: candidate.cut, end, identities }, similarityInput),
    ];
}
//# sourceMappingURL=git-history-change-point-search.js.map