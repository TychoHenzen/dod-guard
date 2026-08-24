import { posix } from "node:path";
import type {
  AnalysisWarning,
  ParsedReference,
  ReferenceGraph,
  ReferenceKind,
  SourceLanguage,
  SourceSpan,
} from "./types.js";

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;
const STATIC_IMPORT = /\bimport\s+(?:[^"'`;\r\n]*?\s+from\s+)?(["'])([^"'\r\n]+)\1/g;
const REQUIRE_CALL = /\brequire\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;

/** Candidate metadata supplied to a language-specific reference backend. */
export interface ReferenceCandidate {
  readonly path: string;
  readonly language: SourceLanguage;
}

/** The injected synchronous read boundary for eligible current source files. */
export type ReferenceSourceReader = (source: ReferenceCandidate) => string;

/** Source content retained for a later language-specific parser. */
export interface ReferenceSourceContent extends ReferenceCandidate {
  readonly content: string;
}

/** Nonfatal source-read evidence returned before parsing or reference resolution. */
export interface ReferenceReadResult {
  readonly graph: ReferenceGraph;
  readonly sources: readonly ReferenceSourceContent[];
  readonly warnings: readonly AnalysisWarning[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sourceSpan(content: string, start: number, end: number): SourceSpan {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  return {
    start,
    end,
    line: content.slice(0, start).split("\n").length,
    column: start - lineStart + 1,
  };
}

function targetCandidates(sourcePath: string, specifier: string): string[] {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) return [specifier];
  const literal = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  return [
    literal,
    ...MODULE_EXTENSIONS.map((extension) => `${literal}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${literal}/index${extension}`),
  ];
}

function parsedModuleReferences(source: ReferenceSourceContent): ParsedReference[] {
  if (!(source.language === "typescript" || source.language === "javascript")) return [];
  const patterns: readonly [ReferenceKind, RegExp][] = [
    ["import", STATIC_IMPORT],
    ["require", REQUIRE_CALL],
    ["dynamic-import", DYNAMIC_IMPORT],
  ];
  const references: ParsedReference[] = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
      const quote = match[1];
      const specifier = match[2];
      if (!(quote && specifier && match.index !== undefined)) continue;
      const start = match.index + match[0].lastIndexOf(`${quote}${specifier}${quote}`) + 1;
      const candidates = targetCandidates(source.path, specifier);
      references.push({
        sourcePath: source.path,
        targetCandidates: candidates,
        span: sourceSpan(source.content, start, start + specifier.length),
        language: source.language,
        kind,
        resolution: specifier.startsWith(".") ? ("unresolved" as const) : ("external" as const),
        strength: "strong",
      });
    }
  }
  return references.sort(
    (left, right) =>
      compareText(left.sourcePath, right.sourcePath) ||
      left.span.start - right.span.start ||
      compareText(left.kind, right.kind),
  );
}

/** Parses and resolves supported TypeScript and JavaScript module references from current source inventory. */
export function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph {
  const paths = new Set(sources.map((source) => source.path));
  const parsed = sources.flatMap(parsedModuleReferences);
  const edges = parsed
    .filter((reference) => reference.targetCandidates.find((candidate) => paths.has(candidate)) !== undefined)
    .map((reference) => ({
      sourcePath: reference.sourcePath,
      targetPath: reference.targetCandidates.find((candidate) => paths.has(candidate)) ?? "",
      language: reference.language,
      kind: reference.kind,
      strength: reference.strength,
      span: reference.span,
    }));
  const unresolved = parsed
    .filter((reference) => !reference.targetCandidates.some((candidate) => paths.has(candidate)))
    .map(({ sourcePath, targetCandidates: candidates, language, kind, span, resolution }) => ({
      sourcePath,
      targetCandidates: candidates,
      language,
      kind,
      span,
      resolution: resolution === "external" ? ("external" as const) : ("unresolved" as const),
    }));
  return { edges, unresolved, complete: true, unavailablePaths: [] };
}

/** Produces normalized unavailable evidence for candidates with no reference backend. */
export function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph {
  const unavailablePaths = [
    ...new Set(
      candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths,
  };
}

/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export function readReferenceSources(
  sources: readonly ReferenceCandidate[],
  readSource: ReferenceSourceReader,
): ReferenceReadResult {
  const readableSources: ReferenceSourceContent[] = [];
  const unavailablePaths: string[] = [];
  const warnings: AnalysisWarning[] = [];
  for (const source of sources) {
    try {
      readableSources.push({ ...source, content: readSource(source) });
    } catch {
      unavailablePaths.push(source.path);
      warnings.push({
        code: "reference_unreadable",
        message: "Reference source could not be read.",
        path: source.path,
      });
    }
  }
  unavailablePaths.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  warnings.sort((left, right) =>
    (left.path ?? "") < (right.path ?? "") ? -1 : (left.path ?? "") > (right.path ?? "") ? 1 : 0,
  );
  return {
    graph: {
      edges: [],
      unresolved: [],
      complete: unavailablePaths.length === 0,
      unavailablePaths,
    },
    sources: readableSources,
    warnings,
  };
}
