import type { ReferenceGraph } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
/** Parses and resolves supported TypeScript and JavaScript modules. */
export declare function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
/** Parses and resolves supported TypeScript, JavaScript, C#, and Rust forms. */
export declare function analyzeReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
