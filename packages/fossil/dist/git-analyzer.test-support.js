import { splitAtChangePoint } from "./git-analyzer.js";
export function changePointCommits(fileSets, gapsBefore) {
    let timestamp = 0;
    return fileSets.map((paths, index) => {
        if (index > 0)
            timestamp += gapsBefore.get(index) ?? 60 * 60 * 1_000;
        return {
            hash: `point-${index}`,
            committerTimestampMs: timestamp,
            changes: paths.map((path) => ({ status: "modified", path })),
        };
    });
}
export function changePointPartitionLengths(fileSets, gapsBefore) {
    return splitAtChangePoint(changePointCommits(fileSets, gapsBefore)).map((partition) => partition.length);
}
function fileActivity(input) {
    return { ...input };
}
export const maximumFileActivity = fileActivity({
    identity: "maximum",
    path: "maximum.ts",
    burstCommits: 1,
    postBurstCommits: 100,
    createdInBurst: true,
    existsAtHead: true,
});
//# sourceMappingURL=git-analyzer.test-support.js.map