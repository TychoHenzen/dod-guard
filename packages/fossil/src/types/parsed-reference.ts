import type { ReferenceKind } from "./reference-kind.js";
import type { ReferenceResolution } from "./reference-resolution.js";
import type { ReferenceStrength } from "./reference-strength.js";
import type { SourceLanguage } from "./source-language.js";
import type { SourceSpan } from "./source-span.js";

export interface ParsedReference {
  readonly sourcePath: string;
  readonly targetCandidates: readonly string[];
  readonly span: SourceSpan;
  readonly language: SourceLanguage;
  readonly kind: ReferenceKind;
  readonly resolution: ReferenceResolution;
  readonly strength: Exclude<ReferenceStrength, "vestigial">;
  readonly targetPath?: string;
}
