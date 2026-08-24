const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";
export function terminalSafeText(value) {
    return [...value]
        .map((character) => {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined || (codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f))) {
            return character;
        }
        return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    })
        .join("");
}
function topLevelDirectory(path) {
    const normalized = normalizedPath(path);
    const separator = normalized.indexOf("/");
    return separator === -1 ? undefined : normalized.slice(0, separator);
}
function normalizedPath(path) {
    return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
function comparePaths(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function utcDate(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 10);
}
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
    return isTty ? `${BOLD}${value}${RESET}` : value;
}
function burstTableLine(row, isTty) {
    switch (row.kind) {
        case "burst":
            return styleBurstHeader(`Burst ${terminalSafeText(row.id)}: ${row.startDate} to ${row.endDate}, ${row.commitCount} commits, ${row.fileCount} files`, isTty);
        case "survivor":
            return `  survivor ${terminalSafeText(row.path)}`;
        case "finding":
            return `  finding ${terminalSafeText(row.path)}: score ${row.score} (${row.scoreBasis})`;
        case "finding-explanation": {
            const reference = row.referenceAvailability === "unavailable"
                ? "reference evidence unavailable"
                : `references: ${row.strongInboundReferences} strong inbound, ${row.candidateNeighbors.length} candidate neighbors, ${row.liveNeighbors.length} live neighbors`;
            return `    ${row.createdInBurst ? "created in burst" : "existed before burst"}; ${row.burstCommits} burst commits, ${row.postBurstCommits} post-burst commits; ${reference}`;
        }
    }
}
/** Renders current burst table rows with explicit caller-owned TTY styling control. */
export function renderBurstTableRows(rows, { isTty }) {
    return rows.map((row) => burstTableLine(row, isTty)).join("\n");
}
/** Serializes the versioned report as one machine-readable JSON document. */
export function renderFossilReportJson(report) {
    return JSON.stringify(finalizeFossilReport(report));
}
/** Counts burst-path finding records and their unique normalized candidate paths. */
export function candidateFindingCounts(bursts) {
    const paths = bursts.flatMap((burst) => burst.findings.map((finding) => normalizedPath(finding.path)));
    return { candidateFindingCount: paths.length, uniqueCandidatePathCount: new Set(paths).size };
}
/** Applies the report statistics derived from its burst-path finding records. */
export function finalizeFossilReport(report) {
    return {
        ...report,
        statistics: { ...report.statistics, ...candidateFindingCounts(report.bursts) },
        warnings: [...report.warnings].sort((left, right) => comparePaths(left.code, right.code) ||
            comparePaths(normalizedPath(left.path ?? ""), normalizedPath(right.path ?? "")) ||
            comparePaths(left.message, right.message)),
    };
}
/** Produces normal or verbose table rows without changing the underlying debris findings. */
export function workspaceDebrisTableRows(findings, mode) {
    if (mode === "verbose")
        return findings.map((finding) => ({ kind: "finding", finding }));
    const ignoredDirectoryCounts = new Map();
    for (const finding of findings) {
        const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
        if (directory)
            ignoredDirectoryCounts.set(directory, (ignoredDirectoryCounts.get(directory) ?? 0) + 1);
    }
    const summarizedDirectories = new Set([...ignoredDirectoryCounts].filter(([, count]) => count >= 20).map(([directory]) => directory));
    const emittedDirectories = new Set();
    const rows = [];
    for (const finding of findings) {
        const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
        if (!(directory && summarizedDirectories.has(directory))) {
            rows.push({ kind: "finding", finding });
            continue;
        }
        if (emittedDirectories.has(directory))
            continue;
        emittedDirectories.add(directory);
        rows.push({ kind: "ignored-directory-summary", directory, count: ignoredDirectoryCounts.get(directory) ?? 0 });
    }
    return rows;
}
//# sourceMappingURL=fossil-output-core.js.map