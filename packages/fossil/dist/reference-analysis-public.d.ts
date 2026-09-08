import type { ReferenceGraph } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
/** Parses and resolves supported TypeScript and JavaScript module references from current source inventory. */
export declare function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
/** Parses and resolves the currently supported TypeScript, JavaScript, C#, and Rust reference forms. */
export declare function analyzeReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
