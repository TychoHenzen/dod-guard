import { conditionalFallbackRanges } from "./reference-analysis-conditional.js";
import { localImportBindings } from "./reference-analysis-declarations.js";
import { fallbackOperandRanges } from "./reference-analysis-fallback-operands.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import { tryCatchRanges } from "./reference-analysis-try-catch.js";
const BINDING_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const BINDING_PREFIX = "(^|[^A-Za-z0-9_$])";
const BINDING_SUFFIX = "(?![A-Za-z0-9_$])";
function importDeclarationEnd(content, spanEnd) {
    const semicolon = content.indexOf(";", spanEnd);
    const newline = content.indexOf("\n", spanEnd);
    if (semicolon === -1)
        return newline;
    if (newline === -1)
        return semicolon;
    return Math.min(semicolon, newline);
}
function bindingPattern(binding) {
    const escaped = binding.replace(BINDING_ESCAPE, "\\$&");
    return new RegExp(`${BINDING_PREFIX}(${escaped})${BINDING_SUFFIX}`, "g");
}
function referenceIndex(match) {
    return (match.index ?? -1) + (match[1]?.length ?? 0);
}
function isOutsideDeclaration(index, declarationStart, declarationEnd) {
    if (index < declarationStart)
        return true;
    return index > declarationEnd;
}
function isCodeUse({ index, source, declarationStart, declarationEnd, view }) {
    if (!isOutsideDeclaration(index, declarationStart, declarationEnd))
        return false;
    return view.code[index] === source.content[index];
}
function bindingUses({ binding, source, declarationStart, declarationEnd, view }) {
    return [...source.content.matchAll(bindingPattern(binding))]
        .map(referenceIndex)
        .filter((index) => isCodeUse({ index, source, declarationStart, declarationEnd, view }));
}
function importUses({ bindings, source, declarationStart, declarationEnd, view }) {
    return bindings.flatMap((binding) => bindingUses({ binding, source, declarationStart, declarationEnd, view }));
}
function fallbackRegions(source, view) {
    return [...tryCatchRanges(source.content), ...conditionalFallbackRanges(view), ...fallbackOperandRanges(view.code)];
}
function isInsideFallback(index, regions) {
    return regions.some((range) => index > range.start && index < range.end);
}
export function importReferenceStrength(reference, source) {
    const declarationStart = source.content.lastIndexOf("import", reference.span.start);
    const declarationEnd = importDeclarationEnd(source.content, reference.span.end);
    const declaration = source.content.slice(declarationStart, declarationEnd + 1);
    const bindings = localImportBindings(declaration);
    if (bindings.length === 0)
        return "strong";
    const view = syntaxView(source.content);
    const uses = importUses({ bindings, source, declarationStart, declarationEnd, view });
    const regions = fallbackRegions(source, view);
    if (uses.length === 0)
        return "strong";
    if (!uses.every((index) => isInsideFallback(index, regions)))
        return "strong";
    return "weak";
}
//# sourceMappingURL=reference-analysis-strength-import.js.map