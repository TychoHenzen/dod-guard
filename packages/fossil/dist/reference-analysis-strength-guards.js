import { declarationRange } from "./reference-analysis-declarations.js";
import { csharpGuardRanges, rustGuardRanges } from "./reference-analysis-guards.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
function separatorForGuard(reference) {
    if (reference.kind === "csharp-using")
        return ".";
    return "::";
}
function targetPath(reference) {
    if (reference.targetPath !== undefined)
        return reference.targetPath;
    const candidate = reference.targetCandidates[0];
    if (candidate !== undefined)
        return candidate;
    return "";
}
function targetSymbol(reference) {
    const symbol = targetPath(reference).split(/[/.]/).at(-2);
    if (symbol === undefined)
        return "";
    return symbol;
}
function guardSymbol(reference, source) {
    const declared = source.content.slice(reference.span.start, reference.span.end);
    const symbol = declared.split(separatorForGuard(reference)).at(-1);
    if (symbol !== undefined)
        return symbol;
    return targetSymbol(reference);
}
function guardUses(reference, source, view) {
    const symbol = guardSymbol(reference, source);
    const [declarationStart, declarationEnd] = declarationRange(source.content, reference.span.start);
    return [...source.content.matchAll(new RegExp(`\\b${symbol}\\b`, "g"))]
        .map((match) => match.index ?? -1)
        .filter((index) => (index < declarationStart || index >= declarationEnd) && view.code[index] === source.content[index]);
}
function guardRanges(reference, view) {
    if (reference.kind === "csharp-using")
        return csharpGuardRanges(view);
    return rustGuardRanges(view);
}
function allUsesAreGuarded(uses, ranges) {
    if (uses.length === 0)
        return false;
    return uses.every((index) => ranges.some(([start, end]) => index > start && index < end));
}
export function guardedReferenceStrength(reference, source) {
    const view = syntaxView(source.content);
    const uses = guardUses(reference, source, view);
    const ranges = guardRanges(reference, view);
    if (allUsesAreGuarded(uses, ranges))
        return "weak";
    return "strong";
}
//# sourceMappingURL=reference-analysis-strength-guards.js.map