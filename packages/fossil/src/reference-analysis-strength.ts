import type { ParsedReference } from "./types.js";
import type {
  ReferenceSourceContent,
} from "./reference-analysis-types/reference-source-content.js";
import {
  guardedReferenceStrength,
} from "./reference-analysis-strength-guards.js";
import {
  importReferenceStrength,
} from "./reference-analysis-strength-import.js";

function isGuardReference(reference: ParsedReference): boolean {
  if (reference.kind === "csharp-using") return true;
  if (reference.kind === "rust-mod") return true;
  return reference.kind === "rust-use";
}

export function strengthForReference(
  reference: ParsedReference,
  sources: readonly ReferenceSourceContent[],
): "strong" | "weak" {
  const source = sources.find(
    (candidate) => candidate.path === reference.sourcePath,
  );
  if (!source) return "strong";
  if (isGuardReference(reference))
    return guardedReferenceStrength(reference, source);
  if (reference.kind !== "import") return "strong";
  return importReferenceStrength(reference, source);
}
