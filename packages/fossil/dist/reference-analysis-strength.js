import { guardedReferenceStrength } from "./reference-analysis-strength-guards.js";
import { importReferenceStrength } from "./reference-analysis-strength-import.js";
function isGuardReference(reference) {
    if (reference.kind === "csharp-using")
        return true;
    if (reference.kind === "rust-mod")
        return true;
    return reference.kind === "rust-use";
}
export function strengthForReference(reference, sources) {
    const source = sources.find((candidate) => candidate.path === reference.sourcePath);
    if (!source)
        return "strong";
    if (isGuardReference(reference))
        return guardedReferenceStrength(reference, source);
    if (reference.kind !== "import")
        return "strong";
    return importReferenceStrength(reference, source);
}
//# sourceMappingURL=reference-analysis-strength.js.map