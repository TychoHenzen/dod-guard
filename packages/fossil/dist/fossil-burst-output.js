import { comparePaths, normalizedPath, terminalSafeText, utcDate } from "./fossil-output-text.js";
function findingTableRows(burst, mode) {
    return burst.findings
        .map((finding) => ({ ...finding, normalizedPath: normalizedPath(finding.path) }))
        .sort((left, right) => right.score - left.score || comparePaths(left.normalizedPath, right.normalizedPath))
        .flatMap((finding) => {
        const row = {
            kind: "finding",
            path: finding.normalizedPath,
            score: finding.score,
            scoreBasis: finding.scoreBasis,
        };
        if (mode === "normal")
            return [row];
        return [
            row,
            {
                kind: "finding-explanation",
                createdInBurst: finding.activity.createdInBurst,
                burstCommits: finding.activity.burstCommits,
                postBurstCommits: finding.activity.postBurstCommits,
                referenceAvailability: finding.referenceAvailability,
                strongInboundReferences: finding.strongInboundReferences,
                candidateNeighbors: finding.candidateNeighbors.map(normalizedPath).sort(comparePaths),
                liveNeighbors: finding.liveNeighbors.map(normalizedPath).sort(comparePaths),
            },
        ];
    });
}
/** Produces deterministic burst, survivor, and candidate rows in their required table order. */
export function burstTableRows(bursts, mode = "normal") {
    return [...bursts]
        .sort((left, right) => right.endTimestampMs - left.endTimestampMs ||
        right.startTimestampMs - left.startTimestampMs ||
        comparePaths(left.id, right.id))
        .flatMap((burst) => [
        {
            kind: "burst",
            id: burst.id,
            startDate: utcDate(burst.startTimestampMs),
            endDate: utcDate(burst.endTimestampMs),
            commitCount: burst.commitCount,
            fileCount: burst.fileCount,
        },
        ...burst.survivors
            .map((survivor) => normalizedPath(survivor.path))
            .sort(comparePaths)
            .map((path) => ({ kind: "survivor", path })),
        ...findingTableRows(burst, mode),
    ]);
}
function styleBurstHeader(value, isTty) {
    return isTty ? `\u001b[1m${value}\u001b[0m` : value;
}
function findingExplanationLine(row) {
    const reference = row.referenceAvailability === "unavailable"
        ? "reference evidence unavailable"
        : `references: ${row.strongInboundReferences} strong inbound, ${row.candidateNeighbors.length} candidate neighbors, ${row.liveNeighbors.length} live neighbors`;
    return `    ${row.createdInBurst ? "created in burst" : "existed before burst"}; ${row.burstCommits} burst commits, ${row.postBurstCommits} post-burst commits; ${reference}`;
}
function burstTableLine(row, isTty) {
    switch (row.kind) {
        case "burst":
            return styleBurstHeader(`Burst ${terminalSafeText(row.id)}: ${row.startDate} to ${row.endDate}, ${row.commitCount} commits, ${row.fileCount} files`, isTty);
        case "survivor":
            return `  survivor ${terminalSafeText(row.path)}`;
        case "finding":
            return `  finding ${terminalSafeText(row.path)}: score ${row.score} (${row.scoreBasis})`;
        case "finding-explanation":
            return findingExplanationLine(row);
    }
}
/** Renders current burst table rows with explicit caller-owned TTY styling control. */
export function renderBurstTableRows(rows, { isTty }) {
    return rows.map((row) => burstTableLine(row, isTty)).join("\n");
}
//# sourceMappingURL=fossil-burst-output.js.map