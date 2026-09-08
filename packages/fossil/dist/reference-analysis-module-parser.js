import { compareText, sourceSpan, targetCandidates } from "./reference-analysis-paths.js";
const STATIC_IMPORT = /\bimport\s+(?:[^"'`;\r\n]*?\s+from\s+)?(["'])([^"'\r\n]+)\1/g;
const REQUIRE_CALL = /\brequire\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
export function parsedModuleReferences(source) {
    if (!(source.language === "typescript" || source.language === "javascript"))
        return [];
    const patterns = [
        ["import", STATIC_IMPORT],
        ["require", REQUIRE_CALL],
        ["dynamic-import", DYNAMIC_IMPORT],
    ];
    const references = [];
    for (const [kind, pattern] of patterns) {
        pattern.lastIndex = 0;
        for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
            const quote = match[1];
            const specifier = match[2];
            if (!(quote && specifier && match.index !== undefined))
                continue;
            const start = match.index + match[0].lastIndexOf(`${quote}${specifier}${quote}`) + 1;
            references.push({
                sourcePath: source.path,
                targetCandidates: targetCandidates(source.path, specifier),
                span: sourceSpan(source.content, start, start + specifier.length),
                language: source.language,
                kind,
                resolution: specifier.startsWith(".") ? "unresolved" : "external",
                strength: "strong",
            });
        }
    }
    return references.sort((left, right) => compareText(left.sourcePath, right.sourcePath) ||
        left.span.start - right.span.start ||
        compareText(left.kind, right.kind));
}
//# sourceMappingURL=reference-analysis-module-parser.js.map