import type { ReferenceGraph } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { parsedCsharpReferences } from "./reference-analysis-csharp-parser.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import { parsedRustReferences } from "./reference-analysis-rust-parser.js";

/** Parses and resolves supported TypeScript and JavaScript module references from current source inventory. */
export function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph {
  return referenceGraph(sources.flatMap(parsedModuleReferences), sources);
}

/** Parses and resolves the currently supported TypeScript, JavaScript, C#, and Rust reference forms. */
export function analyzeReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph {
  return referenceGraph(
    sources.flatMap((source) => [
      ...parsedModuleReferences(source),
      ...parsedCsharpReferences(source, sources),
      ...parsedRustReferences(source),
    ]),
    sources,
  );
}
