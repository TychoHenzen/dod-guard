import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type { ReferenceRange } from "./reference-analysis-types/reference-range.js";
export declare function csharpGuardRanges(view: SyntaxView): readonly ReferenceRange[];
export declare function rustGuardRanges(view: SyntaxView): readonly ReferenceRange[];
