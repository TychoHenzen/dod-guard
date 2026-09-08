import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
export declare function csharpGuardRanges(view: SyntaxView): readonly [number, number][];
export declare function rustGuardRanges(view: SyntaxView): readonly [number, number][];
