import { posix } from "node:path";
import type { ParsedReference, ReferenceKind } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { compareText, sourceSpan } from "./reference-analysis-paths.js";

const RUST_MODULE = /^\s*mod\s+([A-Za-z_]\w*)\s*;\s*$/gm;
const RUST_CRATE_USE = /^\s*use\s+crate::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*;\s*$/gm;

function nearestCargoSourceRoot(path: string): string | undefined {
  if (path.startsWith("src/")) return "src";
  const rootStart = path.lastIndexOf("/src/");
  return rootStart === -1 ? undefined : path.slice(0, rootStart + 4);
}

export function parsedRustReferences(source: ReferenceSourceContent): ParsedReference[] {
  if (source.language !== "rust") return [];
  const patterns: readonly [ReferenceKind, RegExp, (name: string) => string[]][] = [
    [
      "rust-mod",
      RUST_MODULE,
      (name) => {
        const sibling = posix.join(posix.dirname(source.path), name);
        return [`${sibling}.rs`, `${sibling}/mod.rs`];
      },
    ],
    [
      "rust-use",
      RUST_CRATE_USE,
      (name) => {
        const root = nearestCargoSourceRoot(source.path);
        const module = name.replaceAll("::", "/");
        return root ? [`${root}/${module}.rs`, `${root}/${module}/mod.rs`] : [];
      },
    ],
  ];
  const references: ParsedReference[] = [];
  for (const [kind, pattern, candidatesFor] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
      const name = match[1];
      if (!(name && match.index !== undefined)) continue;
      const start = match.index + match[0].indexOf(name);
      references.push({
        sourcePath: source.path,
        targetCandidates: candidatesFor(name),
        span: sourceSpan(source.content, start, start + name.length),
        language: "rust",
        kind,
        resolution: "unresolved",
        strength: "strong",
      });
    }
  }
  return references.sort((left, right) => left.span.start - right.span.start || compareText(left.kind, right.kind));
}
