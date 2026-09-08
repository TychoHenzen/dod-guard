import type { ReferenceKind } from "./reference-kind.js";
import type { ReferenceStrength } from "./reference-strength.js";
import type { SourceLanguage } from "./source-language.js";
import type { SourceSpan } from "./source-span.js";
export interface ReferenceEdge {
    readonly sourcePath: string;
    readonly targetPath: string;
    readonly language: SourceLanguage;
    readonly kind: ReferenceKind;
    readonly strength: ReferenceStrength;
    readonly span: SourceSpan;
}
