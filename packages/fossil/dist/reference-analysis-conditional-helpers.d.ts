import type { ReferenceRange } from "./reference-analysis-types.js";
import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
declare function conditionalRange(view: SyntaxView, matchIndex: number): ReferenceRange[];
export { conditionalRange };
