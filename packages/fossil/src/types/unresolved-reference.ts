import type { ReferenceKind } from "./reference-kind.js";
import type { ReferenceResolution } from "./reference-resolution.js";
import type { SourceLanguage } from "./source-language.js";
import type { SourceSpan } from "./source-span.js";

export interface UnresolvedReference {
  readonly sourcePath: string;
  readonly targetCandidates: readonly string[];
  readonly language: SourceLanguage;
  readonly kind: ReferenceKind;
  readonly span: SourceSpan;
  readonly resolution: Exclude<ReferenceResolution, "resolved">;
}
