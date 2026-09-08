import { posix } from "node:path";
import type { ParsedReference, ReferenceKind } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import { compareText, sourceSpan } from "./reference-analysis-paths.js";

const RUST_MODULE = /^\s*mod\s+([A-Za-z_]\w*)\s*;\s*$/gm;
const RUST_CRATE_USE =
  /^\s*use\s+crate::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*;\s*$/gm;

function nearestCargoSourceRoot(path: string): string | undefined {
  if (path.startsWith("src/")) return "src";
  const rootStart = path.lastIndexOf("/src/");
  return rootStart === -1 ? undefined : path.slice(0, rootStart + 4);
}

function rustModuleCandidates(sourcePath: string, name: string): string[] {
  const sibling = posix.join(posix.dirname(sourcePath), name);
  return [`${sibling}.rs`, `${sibling}/mod.rs`];
}

function rustUseCandidates(sourcePath: string, name: string): string[] {
  const root = nearestCargoSourceRoot(sourcePath);
  if (!root) return [];
  const module = name.replaceAll("::", "/");
  return [`${root}/${module}.rs`, `${root}/${module}/mod.rs`];
}

function rustReference(
  source: ReferenceSourceContent,
  kind: ReferenceKind,
  candidatesFor: (name: string) => string[],
  match: RegExpExecArray,
): ParsedReference | undefined {
  const name = match[1];
  if (!name) return undefined;
  if (match.index === undefined) return undefined;
  const start = match.index + match[0].indexOf(name);
  return {
    sourcePath: source.path,
    targetCandidates: candidatesFor(name),
    span: sourceSpan(source.content, start, start + name.length),
    language: "rust",
    kind,
    resolution: "unresolved",
    strength: "strong",
  };
}

function compareRustReferences(
  left: ParsedReference,
  right: ParsedReference,
): number {
  const byPosition = left.span.start - right.span.start;
  if (byPosition !== 0) return byPosition;
  return compareText(left.kind, right.kind);
}

interface RustPattern {
  kind: ReferenceKind;
  pattern: RegExp;
  candidatesFor: (name: string) => string[];
}

function rustPatterns(source: ReferenceSourceContent): readonly RustPattern[] {
  return [
    {
      kind: "rust-mod",
      pattern: RUST_MODULE,
      candidatesFor: (name) => rustModuleCandidates(source.path, name),
    },
    {
      kind: "rust-use",
      pattern: RUST_CRATE_USE,
      candidatesFor: (name) => rustUseCandidates(source.path, name),
    },
  ];
}

export function parsedRustReferences(
  source: ReferenceSourceContent,
): ParsedReference[] {
  if (source.language !== "rust") return [];
  const patterns = rustPatterns(source);
  const references: ParsedReference[] = [];
  for (const { kind, pattern, candidatesFor } of patterns) {
    pattern.lastIndex = 0;
    for (
      let match = pattern.exec(source.content);
      match;
      match = pattern.exec(source.content)
    ) {
      const reference = rustReference(source, kind, candidatesFor, match);
      if (reference) references.push(reference);
    }
  }
  return references.sort(compareRustReferences);
}
