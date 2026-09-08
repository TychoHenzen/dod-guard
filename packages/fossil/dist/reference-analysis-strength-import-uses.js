const BINDING_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const BINDING_PREFIX = "(^|[^A-Za-z0-9_$])";
const BINDING_SUFFIX = "(?![A-Za-z0-9_$])";
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
function isCodeUse(input) {
    if (!isOutsideDeclaration(input.index, input.declarationStart, input.declarationEnd))
        return false;
    return input.view.code[input.index] === input.source.content[input.index];
}
function bindingUses(input) {
    return [...input.source.content.matchAll(bindingPattern(input.binding))]
        .map(referenceIndex)
        .filter((index) => isCodeUse({ ...input, index }));
}
export function importUses(input) {
    return input.bindings.flatMap((binding) => bindingUses({ ...input, binding }));
}
//# sourceMappingURL=reference-analysis-strength-import-uses.js.map