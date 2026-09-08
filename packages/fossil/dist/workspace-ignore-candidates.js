function ignoredCandidate(file, ignore) {
    return {
        path: file.path,
        kind: "ignored",
        modifiedTimestampMs: file.modifiedTimestampMs,
        ignore: { rule: ignore.rule, source: ignore.source },
    };
}
export function oldIgnoredWorkspaceCandidates(input) {
    const provenanceByPath = new Map(input.provenance.map((entry) => [entry.path, entry]));
    const cutoffTimestampMs = input.analysisTimestampMs - input.minimumAgeDays * 24 * 60 * 60 * 1_000;
    return input.files.flatMap((file) => {
        const ignore = provenanceByPath.get(file.path);
        if (!(file.isRegularFile &&
            file.modifiedTimestampMs <= cutoffTimestampMs &&
            ignore))
            return [];
        return [ignoredCandidate(file, ignore)];
    });
}
//# sourceMappingURL=workspace-ignore-candidates.js.map