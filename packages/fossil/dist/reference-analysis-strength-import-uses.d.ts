import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
export declare function importUses(input: {
    bindings: readonly string[];
    source: ReferenceSourceContent;
    declarationStart: number;
    declarationEnd: number;
    view: ReturnType<typeof syntaxView>;
}): number[];
