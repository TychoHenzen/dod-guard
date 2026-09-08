import { conditionalFallbackRanges } from "./reference-analysis-conditional.js";
import { declarationRange, localImportBindings } from "./reference-analysis-declarations.js";
import { fallbackOperandRanges } from "./reference-analysis-fallback-operands.js";
import { csharpGuardRanges, rustGuardRanges } from "./reference-analysis-guards.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import { tryCatchRanges } from "./reference-analysis-try-catch.js";
function guardSymbol(reference, source) {
    const declared = source.content.slice(reference.span.start, reference.span.end);
    const separator = reference.kind === "csharp-using" ? "." : "::";
    return (declared.split(separator).at(-1) ??
        (reference.targetPath ?? reference.targetCandidates[0] ?? "").split(/[/.]/).at(-2) ??
        "");
}
export function strengthForReference(reference, sources) {
    const source = sources.find((candidate) => candidate.path === reference.sourcePath);
    if (!source)
        return "strong";
    if (reference.kind === "csharp-using" || reference.kind === "rust-mod" || reference.kind === "rust-use") {
        const symbol = guardSymbol(reference, source);
        const view = syntaxView(source.content);
        const [declarationStart, declarationEnd] = declarationRange(source.content, reference.span.start);
        const uses = [...source.content.matchAll(new RegExp(`\\b${symbol}\\b`, "g"))]
            .map((match) => match.index ?? -1)
            .filter((index) => (index < declarationStart || index >= declarationEnd) && view.code[index] === source.content[index]);
        const guards = reference.kind === "csharp-using" ? csharpGuardRanges(view) : rustGuardRanges(view);
        return uses.length > 0 && uses.every((index) => guards.some(([start, end]) => index > start && index < end))
            ? "weak"
            : "strong";
    }
    if (reference.kind !== "import")
        return "strong";
    const declarationStart = source.content.lastIndexOf("import", reference.span.start);
    const semicolon = source.content.indexOf(";", reference.span.end);
    const newline = source.content.indexOf("\n", reference.span.end);
    const declarationEnd = semicolon === -1 ? newline : newline === -1 ? semicolon : Math.min(semicolon, newline);
    const declaration = source.content.slice(declarationStart, declarationEnd + 1);
    const bindings = localImportBindings(declaration);
    if (bindings.length === 0)
        return "strong";
    const view = syntaxView(source.content);
    const uses = bindings.flatMap((binding) => [
        ...source.content.matchAll(new RegExp(`(^|[^A-Za-z0-9_$])(${binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![A-Za-z0-9_$])`, "g")),
    ]
        .map((match) => (match.index ?? -1) + (match[1]?.length ?? 0))
        .filter((index) => (index < declarationStart || index > declarationEnd) && view.code[index] === source.content[index]));
    const regions = [
        ...tryCatchRanges(source.content),
        ...conditionalFallbackRanges(view),
        ...fallbackOperandRanges(view.code),
    ];
    return uses.length > 0 && uses.every((index) => regions.some(([start, end]) => index > start && index < end))
        ? "weak"
        : "strong";
}
//# sourceMappingURL=reference-analysis-strength.js.map