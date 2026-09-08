import { posix } from "node:path";
import type { AnalysisWarning, ReferenceGraph, SourceSpan } from "./types.js";

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sourceSpan(content: string, start: number, end: number): SourceSpan {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  return {
    start,
    end,
    line: content.slice(0, start).split("\n").length,
    column: start - lineStart + 1,
  };
}

export function targetCandidates(sourcePath: string, specifier: string): string[] {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) return [specifier];
  const literal = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  return [
    literal,
    ...MODULE_EXTENSIONS.map((extension) => `${literal}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${literal}/index${extension}`),
  ];
}

export function normalizedPath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/"));
}

export function pathIsWithin(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedPath(root).replace(/\/$/, "");
  const normalizedCandidate = normalizedPath(candidate);
  const compareRoot = /^[A-Za-z]:\//.test(normalizedRoot) ? normalizedRoot.toLowerCase() : normalizedRoot;
  const compareCandidate = /^[A-Za-z]:\//.test(normalizedCandidate)
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  return compareCandidate === compareRoot || compareCandidate.startsWith(`${compareRoot}/`);
}

export function isOutsideRepositoryPath(path: string): boolean {
  const normalized = normalizedPath(path);
  return (
    normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
  );
}

export function outsideBoundaryWarning(sourcePath: string): AnalysisWarning {
  return {
    code: "reference_outside_boundary",
    message: "Relative reference target is outside the repository boundary.",
    path: sourcePath,
  };
}
