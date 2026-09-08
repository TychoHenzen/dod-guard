import { localImportBindings } from "./reference-analysis-declarations.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import { fallbackRegions, isInsideFallback, } from "./reference-analysis-strength-import-fallback.js";
import { importUses } from "./reference-analysis-strength-import-uses.js";
function importDeclarationEnd(content, spanEnd) {
    const semicolon = content.indexOf(";", spanEnd);
    const newline = content.indexOf("\n", spanEnd);
    if (semicolon === -1)
        return newline;
    if (newline === -1)
        return semicolon;
    return Math.min(semicolon, newline);
}
function importDeclaration(reference, source) {
    const declarationStart = source.content.lastIndexOf("import", reference.span.start);
    const declarationEnd = importDeclarationEnd(source.content, reference.span.end);
    return {
        text: source.content.slice(declarationStart, declarationEnd + 1),
        declarationStart,
        declarationEnd,
    };
}
export function importReferenceStrength(reference, source) {
    const { text: declaration, declarationStart, declarationEnd, } = importDeclaration(reference, source);
    const bindings = localImportBindings(declaration);
    if (bindings.length === 0)
        return "strong";
    const view = syntaxView(source.content);
    const uses = importUses({
        bindings,
        source,
        declarationStart,
        declarationEnd,
        view,
    });
    const regions = fallbackRegions(source, view);
    if (uses.length === 0)
        return "strong";
    if (!uses.every((index) => isInsideFallback(index, regions)))
        return "strong";
    return "weak";
}
//# sourceMappingURL=reference-analysis-strength-import.js.map