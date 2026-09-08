export function activity(path, burstCommits, postBurstCommits = 0) {
    return {
        identity: path,
        path,
        burstCommits,
        postBurstCommits,
        createdInBurst: true,
        existsAtHead: true,
    };
}
export function referenceEdge(input) {
    return {
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        language: "typescript",
        kind: input.kind ?? "import",
        strength: input.strength ?? "strong",
        span: {
            start: input.start,
            end: input.start + 1,
            line: 1,
            column: input.column,
        },
    };
}
//# sourceMappingURL=fossil-grader.test-support.js.map