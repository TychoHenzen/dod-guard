import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";

const BINDING_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const BINDING_PREFIX = "(^|[^A-Za-z0-9_$])";
const BINDING_SUFFIX = "(?![A-Za-z0-9_$])";

function bindingPattern(binding: string): RegExp {
  const escaped = binding.replace(BINDING_ESCAPE, "\\$&");
  return new RegExp(`${BINDING_PREFIX}(${escaped})${BINDING_SUFFIX}`, "g");
}

function referenceIndex(match: RegExpExecArray): number {
  return (match.index ?? -1) + (match[1]?.length ?? 0);
}

function isOutsideDeclaration(
  index: number,
  declarationStart: number,
  declarationEnd: number,
): boolean {
  if (index < declarationStart) return true;
  return index > declarationEnd;
}

function isCodeUse(input: {
  index: number;
  source: ReferenceSourceContent;
  declarationStart: number;
  declarationEnd: number;
  view: ReturnType<typeof syntaxView>;
}): boolean {
  if (
    !isOutsideDeclaration(
      input.index,
      input.declarationStart,
      input.declarationEnd,
    )
  )
    return false;
  return input.view.code[input.index] === input.source.content[input.index];
}

function bindingUses(input: {
  binding: string;
  source: ReferenceSourceContent;
  declarationStart: number;
  declarationEnd: number;
  view: ReturnType<typeof syntaxView>;
}): number[] {
  return [...input.source.content.matchAll(bindingPattern(input.binding))]
    .map(referenceIndex)
    .filter((index) => isCodeUse({ ...input, index }));
}

export function importUses(input: {
  bindings: readonly string[];
  source: ReferenceSourceContent;
  declarationStart: number;
  declarationEnd: number;
  view: ReturnType<typeof syntaxView>;
}): number[] {
  return input.bindings.flatMap((binding) =>
    bindingUses({ ...input, binding }),
  );
}
