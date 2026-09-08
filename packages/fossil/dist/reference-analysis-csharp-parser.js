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
function csharpCandidatePaths(currentSources, suffix) {
    return currentSources
        .filter((candidate) => candidate.language === "csharp" && candidate.path.endsWith(suffix))
        .map((candidate) => candidate.path)
        .sort(compareText);
}
function csharpTargetCandidates(matches, suffix) {
    if (matches.length === 0)
        return [suffix];
    return matches;
}
function csharpTargetPath(matches) {
    if (matches.length !== 1)
        return undefined;
    return matches[0];
}
function csharpResolution(matches) {
    if (matches.length === 1)
        return "resolved";
    return "unresolved";
}
function csharpReference(source, currentSources, match) {
    const namespace = match[1];
    if (!namespace)
        return undefined;
    if (match.index === undefined)
        return undefined;
    if (braceDepthBefore(source.content, match.index) > 1)
        return undefined;
    const suffix = `${namespace.replaceAll(".", "/")}.cs`;
    const matches = csharpCandidatePaths(currentSources, suffix);
    const start = match.index + match[0].indexOf(namespace);
    return {
        sourcePath: source.path,
        targetCandidates: csharpTargetCandidates(matches, suffix),
        targetPath: csharpTargetPath(matches),
        span: sourceSpan(source.content, start, start + namespace.length),
        language: "csharp",
        kind: "csharp-using",
        resolution: csharpResolution(matches),
        strength: "strong",
    };
}
export function parsedCsharpReferences(source, currentSources) {
    if (source.language !== "csharp")
        return [];
    const references = [];
    CSHARP_USING.lastIndex = 0;
    for (let match = CSHARP_USING.exec(source.content); match; match = CSHARP_USING.exec(source.content)) {
        const reference = csharpReference(source, currentSources, match);
        if (reference)
            references.push(reference);
    }
    return references;
}
//# sourceMappingURL=reference-analysis-csharp-parser.js.map