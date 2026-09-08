import type { ReferenceRange } from "./reference-analysis-types/reference-range.js";
import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
export declare function rustGuardRanges(view: SyntaxView): readonly ReferenceRange[];
