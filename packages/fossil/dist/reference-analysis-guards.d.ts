import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type { ReferenceRange } from "./reference-analysis-types.js";
export { rustGuardRanges } from "./reference-analysis-rust-guards.js";
export declare function csharpGuardRanges(view: SyntaxView): readonly ReferenceRange[];
