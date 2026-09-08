export function edgeSummary(graph) {
    return graph.edges.map(({ sourcePath, targetPath, language, kind, strength }) => ({
        sourcePath,
        targetPath,
        language,
        kind,
        strength,
    }));
}
//# sourceMappingURL=ref-analyzer.test-support.js.map