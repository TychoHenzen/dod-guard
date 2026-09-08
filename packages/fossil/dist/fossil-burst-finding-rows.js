import { comparePaths, normalizedPath } from "./fossil-output-text.js";
function normalizeFinding(finding) {
    return { ...finding, normalizedPath: normalizedPath(finding.path) };
}
function findingRow(finding) {
    return {
        kind: "finding",
        path: finding.normalizedPath,
        score: finding.score,
        scoreBasis: finding.scoreBasis,
    };
}
function findingExplanationRow(finding) {
    return {
        kind: "finding-explanation",
        createdInBurst: finding.activity.createdInBurst,
        burstCommits: finding.activity.burstCommits,
        postBurstCommits: finding.activity.postBurstCommits,
        referenceAvailability: finding.referenceAvailability,
        strongInboundReferences: finding.strongInboundReferences,
        candidateNeighbors: finding.candidateNeighbors
            .map(normalizedPath)
            .sort(comparePaths),
        liveNeighbors: finding.liveNeighbors.map(normalizedPath).sort(comparePaths),
    };
}
function findingTableRows(burst, mode) {
    const findings = burst.findings
        .map(normalizeFinding)
        .sort((left, right) => right.score - left.score ||
        comparePaths(left.normalizedPath, right.normalizedPath));
    return findings.flatMap((finding) => {
        const row = findingRow(finding);
        if (mode === "normal")
            return [row];
        return [row, findingExplanationRow(finding)];
    });
}
export { findingTableRows };
//# sourceMappingURL=fossil-burst-finding-rows.js.map