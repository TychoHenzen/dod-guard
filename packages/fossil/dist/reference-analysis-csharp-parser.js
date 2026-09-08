import { compareText, sourceSpan } from "./reference-analysis-paths.js";
const CSHARP_USING = /^\s*using\s+(?!static\b)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;\s*$/gm;
function braceDepthBefore(content, end) {
    let depth = 0;
    for (const character of content.slice(0, end)) {
        if (character === "{")
            depth += 1;
        if (character === "}")
            depth -= 1;
    }
    return depth;
}
export function parsedCsharpReferences(source, currentSources) {
    if (source.language !== "csharp")
        return [];
    const references = [];
    CSHARP_USING.lastIndex = 0;
    for (let match = CSHARP_USING.exec(source.content); match; match = CSHARP_USING.exec(source.content)) {
        const namespace = match[1];
        if (!(namespace && match.index !== undefined) || braceDepthBefore(source.content, match.index) > 1)
            continue;
        const suffix = `${namespace.replaceAll(".", "/")}.cs`;
        const matches = currentSources
            .filter((candidate) => candidate.language === "csharp" && candidate.path.endsWith(suffix))
            .map((candidate) => candidate.path)
            .sort(compareText);
        const start = match.index + match[0].indexOf(namespace);
        references.push({
            sourcePath: source.path,
            targetCandidates: matches.length === 0 ? [suffix] : matches,
            targetPath: matches.length === 1 ? matches[0] : undefined,
            span: sourceSpan(source.content, start, start + namespace.length),
            language: "csharp",
            kind: "csharp-using",
            resolution: matches.length === 1 ? "resolved" : "unresolved",
            strength: "strong",
        });
    }
    return references;
}
//# sourceMappingURL=reference-analysis-csharp-parser.js.map