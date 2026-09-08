import { parsedCsharpReferences } from "./reference-analysis-csharp-parser.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import { parsedRustReferences } from "./reference-analysis-rust-parser.js";
/** Parses and resolves supported TypeScript and JavaScript modules. */
export function analyzeJavaScriptReferences(sources) {
    return referenceGraph(sources.flatMap(parsedModuleReferences), sources);
}
/** Parses and resolves supported TypeScript, JavaScript, C#, and Rust forms. */
export function analyzeReferences(sources) {
    return referenceGraph(sources.flatMap((source) => [
        ...parsedModuleReferences(source),
        ...parsedCsharpReferences(source, sources),
        ...parsedRustReferences(source),
    ]), sources);
}
//# sourceMappingURL=reference-analysis-public.js.map