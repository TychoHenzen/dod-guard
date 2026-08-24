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
const CSHARP_USING = /^\s*using\s+(?!static\b)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;\s*$/gm;
const RUST_MODULE = /^\s*mod\s+([A-Za-z_]\w*)\s*;\s*$/gm;
const RUST_CRATE_USE = /^\s*use\s+crate::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*;\s*$/gm;

/** Default hard cap for one source retained by reference analysis. */
export const DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES = 1_048_576;
/** Default hard cap for all source content retained by one reference analysis. */
export const DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES = 268_435_456;

/** Candidate metadata supplied to a language-specific reference backend. */
export interface ReferenceCandidate {
  readonly path: string;
  readonly language: SourceLanguage;
}

/** The injected synchronous read boundary for eligible current source files. */
export type ReferenceSourceReader = (source: ReferenceCandidate) => string;

/** Exact source metadata that allows a size decision before content is read. */
export type ReferenceSourceMetadataReader = (source: ReferenceCandidate) => { readonly byteLength: number };

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

/** Bounded source-read evidence including bytes accepted for later parsing. */
export interface BoundedReferenceReadResult extends ReferenceReadResult {
  readonly acceptedBytes: number;
}

/** Canonical path boundary used to keep resolved relative imports inside the repository. */
export interface ReferenceContainmentBoundary {
  readonly canonicalRepositoryRoot: string;
  readonly canonicalize: (path: string) => string;
}

/** Reference graph plus nonfatal containment evidence. */
export interface ReferenceAnalysisResult {
  readonly graph: ReferenceGraph;
  readonly warnings: readonly AnalysisWarning[];
}

/** Directory entry metadata supplied by the source inventory boundary. */
export interface ReferenceInventoryEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "directory-symlink" | "junction";
}

/** Injected filesystem boundary for deterministic, containment-aware source inventory. */
export interface ReferenceInventoryBoundary {
  readonly repositoryRoot: string;
  readonly canonicalize: (path: string) => string;
  readonly enumerate: (directoryPath: string) => readonly ReferenceInventoryEntry[];
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

function normalizedPath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/"));
}

function canonicalPathKey(path: string): string {
  const normalized = normalizedPath(path);
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function pathIsWithin(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedPath(root).replace(/\/$/, "");
  const normalizedCandidate = normalizedPath(candidate);
  const compareRoot = /^[A-Za-z]:\//.test(normalizedRoot) ? normalizedRoot.toLowerCase() : normalizedRoot;
  const compareCandidate = /^[A-Za-z]:\//.test(normalizedCandidate)
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  return compareCandidate === compareRoot || compareCandidate.startsWith(`${compareRoot}/`);
}

function isOutsideRepositoryPath(path: string): boolean {
  const normalized = normalizedPath(path);
  return (
    normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
  );
}

function outsideBoundaryWarning(sourcePath: string): AnalysisWarning {
  return {
    code: "reference_outside_boundary",
    message: "Relative reference target is outside the repository boundary.",
    path: sourcePath,
  };
}

function repositoryRelativePath(root: string, candidate: string): string {
  const normalizedRoot = normalizedPath(root).replace(/\/$/, "");
  const normalizedCandidate = normalizedPath(candidate);
  return normalizedCandidate.slice(normalizedRoot.length).replace(/^\/+/, "");
}

/** Enumerates ordinary repository directories without traversing links or duplicate canonical directories. */
export function inventoryReferenceSourcePaths(boundary: ReferenceInventoryBoundary): readonly string[] {
  const canonicalRoot = boundary.canonicalize(boundary.repositoryRoot);
  const visitedDirectories = new Set<string>();
  const paths = new Set<string>();
  const walk = (directoryPath: string, canonicalDirectory = boundary.canonicalize(directoryPath)) => {
    if (
      !pathIsWithin(canonicalRoot, canonicalDirectory) ||
      visitedDirectories.has(canonicalPathKey(canonicalDirectory))
    )
      return;
    visitedDirectories.add(canonicalPathKey(canonicalDirectory));
    const entries = [...boundary.enumerate(directoryPath)].sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const entryPath = posix.join(directoryPath.replaceAll("\\", "/"), entry.name);
      if (entry.kind === "directory-symlink" || entry.kind === "junction") continue;
      if (entry.kind === "directory") {
        walk(entryPath);
        continue;
      }
      const canonicalFile = boundary.canonicalize(entryPath);
      if (pathIsWithin(canonicalRoot, canonicalFile))
        paths.add(repositoryRelativePath(boundary.repositoryRoot, entryPath));
    }
  };
  walk(boundary.repositoryRoot, canonicalRoot);
  return [...paths].sort(compareText);
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

function braceDepthBefore(content: string, end: number): number {
  let depth = 0;
  for (const character of content.slice(0, end)) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
  }
  return depth;
}

function parsedCsharpReferences(
  source: ReferenceSourceContent,
  currentSources: readonly ReferenceSourceContent[],
): ParsedReference[] {
  if (source.language !== "csharp") return [];
  const references: ParsedReference[] = [];
  CSHARP_USING.lastIndex = 0;
  for (let match = CSHARP_USING.exec(source.content); match; match = CSHARP_USING.exec(source.content)) {
    const namespace = match[1];
    if (!(namespace && match.index !== undefined) || braceDepthBefore(source.content, match.index) > 1) continue;
    const suffix = `${namespace.replaceAll(".", "/")}.cs`;
    const matches = currentSources
      .filter((candidate) => candidate.language === "csharp" && candidate.path.endsWith(suffix))
      .map((candidate) => candidate.path)
      .sort(compareText);
    const start = match.index + match[0].indexOf(namespace);
    references.push({
      sourcePath: source.path,
      targetCandidates: matches.length === 0 ? [suffix] : matches,
      targetPath: matches.length === 1 ? matches[0] : undefined,
      span: sourceSpan(source.content, start, start + namespace.length),
      language: "csharp",
      kind: "csharp-using",
      resolution: matches.length === 1 ? "resolved" : "unresolved",
      strength: "strong",
    });
  }
  return references;
}

function nearestCargoSourceRoot(path: string): string | undefined {
  if (path.startsWith("src/")) return "src";
  const rootStart = path.lastIndexOf("/src/");
  return rootStart === -1 ? undefined : path.slice(0, rootStart + 4);
}

function parsedRustReferences(source: ReferenceSourceContent): ParsedReference[] {
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

function tryCatchRanges(content: string): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const stack: { kind: boolean; start: number }[] = [];
  let pendingBody: "try" | "catch" | undefined;
  let catchParameterDepth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (/[\w$]/.test(content[end] ?? "")) end += 1;
      const word = content.slice(index, end);
      if (word === "try" || word === "catch") {
        pendingBody = word;
        catchParameterDepth = 0;
      }
      index = end - 1;
      continue;
    }
    if (pendingBody === "catch" && character === "(") {
      catchParameterDepth += 1;
      continue;
    }
    if (pendingBody === "catch" && character === ")" && catchParameterDepth > 0) {
      catchParameterDepth -= 1;
      continue;
    }
    if (character === "{") {
      const kind = pendingBody === "try" || (pendingBody === "catch" && catchParameterDepth === 0);
      stack.push({ kind, start: index });
      if (kind) pendingBody = undefined;
    } else if (character === "}") {
      const opened = stack.pop();
      if (opened?.kind) ranges.push([opened.start, index]);
    }
  }
  return ranges;
}

interface SyntaxView {
  readonly code: string;
  readonly comments: readonly { start: number; end: number; text: string }[];
}

function syntaxView(content: string): SyntaxView {
  const characters = content.split("");
  const comments: { start: number; end: number; text: string }[] = [];
  let quote = "";
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (quote) {
      characters[index] = " ";
      if (character === "\\") {
        characters[index + 1] = " ";
        index += 1;
      } else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      characters[index] = " ";
      continue;
    }
    if (character !== "/" || !(next === "/" || next === "*")) continue;
    const start = index;
    const lineComment = next === "/";
    index += 2;
    while (
      index < content.length &&
      (lineComment ? content[index] !== "\n" : !(content[index] === "*" && content[index + 1] === "/"))
    ) {
      index += 1;
    }
    const end = lineComment ? index : Math.min(content.length, index + 2);
    comments.push({ start, end, text: content.slice(start, end) });
    for (let offset = start; offset < end; offset += 1) {
      if (characters[offset] !== "\n") characters[offset] = " ";
    }
    index = end - 1;
  }
  return { code: characters.join(""), comments };
}

function hasFallbackToken(text: string): boolean {
  return /\b(?:fallback|legacy|old|default)\b/i.test(text);
}

function balancedClose(code: string, open: number, opening: string, closing: string): number | undefined {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === opening) depth += 1;
    if (code[index] === closing && --depth === 0) return index;
  }
  return undefined;
}

function nextNonWhitespace(code: string, start: number): number {
  let index = start;
  while (/\s/.test(code[index] ?? "")) index += 1;
  return index;
}

function hasLeadingFallbackComment(view: SyntaxView, position: number): boolean {
  return view.comments.some(
    (comment) =>
      comment.end <= position && /^\s*$/.test(view.code.slice(comment.end, position)) && hasFallbackToken(comment.text),
  );
}

function conditionalFallbackRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const matcher = /\bif\b/g;
  for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
    const conditionOpen = nextNonWhitespace(view.code, (match.index ?? 0) + match[0].length);
    if (view.code[conditionOpen] !== "(") continue;
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === undefined) continue;
    const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[bodyOpen] !== "{") continue;
    const bodyClose = balancedClose(view.code, bodyOpen, "{", "}");
    if (bodyClose === undefined) continue;
    const fallbackIf =
      hasFallbackToken(view.code.slice(conditionOpen + 1, conditionClose)) ||
      hasLeadingFallbackComment(view, match.index ?? 0);
    if (fallbackIf) ranges.push([bodyOpen, bodyClose]);
    const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
    if (view.code.slice(elseStart, elseStart + 4) !== "else") continue;
    const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
    if (view.code[elseBodyOpen] !== "{") continue;
    const elseBodyClose = balancedClose(view.code, elseBodyOpen, "{", "}");
    if (elseBodyClose !== undefined && (fallbackIf || hasLeadingFallbackComment(view, elseStart)))
      ranges.push([elseBodyOpen, elseBodyClose]);
  }
  return ranges;
}

function fallbackOperandRanges(code: string): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const matcher = /\|\||\?\?/g;
  for (let match = matcher.exec(code); match; match = matcher.exec(code)) {
    const start = nextNonWhitespace(code, (match.index ?? 0) + match[0].length);
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    let end = start;
    for (; end < code.length; end += 1) {
      const character = code[end];
      if (character === "(") parentheses += 1;
      else if (character === ")" && parentheses-- === 0) break;
      else if (character === "[") brackets += 1;
      else if (character === "]" && brackets-- === 0) break;
      else if (character === "{") braces += 1;
      else if (character === "}" && braces-- === 0) break;
      else if (
        parentheses === 0 &&
        brackets === 0 &&
        braces === 0 &&
        (character === ";" || character === "," || character === "\n")
      )
        break;
    }
    if (end > start) ranges.push([start - 1, end]);
  }
  return ranges;
}

function localImportBindings(declaration: string): string[] {
  const bindings = new Set<string>();
  const add = (binding: string | undefined) => {
    if (binding && /^[A-Za-z_$][\w$]*$/.test(binding)) bindings.add(binding);
  };
  const defaultBinding = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from\b)/.exec(declaration)?.[1];
  add(defaultBinding);
  add(/\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(declaration)?.[1]);
  const namedBindings = /\{([^}]*)\}/.exec(declaration)?.[1];
  for (const namedBinding of namedBindings?.split(",") ?? []) {
    const [imported, local] = namedBinding
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/);
    add(local ?? imported);
  }
  return [...bindings];
}

function declarationRange(content: string, position: number): readonly [number, number] {
  const start = content.lastIndexOf("\n", position) + 1;
  const nextNewline = content.indexOf("\n", position);
  return [start, nextNewline === -1 ? content.length : nextNewline];
}

function csharpGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const starts: number[] = [];
  const directives = /^\s*#(if|endif)\b.*$/gm;
  for (let match = directives.exec(view.code); match; match = directives.exec(view.code)) {
    if (match[1] === "if") starts.push(match.index ?? 0);
    else {
      const start = starts.pop();
      if (start !== undefined) ranges.push([start, (match.index ?? 0) + match[0].length]);
    }
  }
  return ranges;
}

function rustGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const attributes = /#\s*\[\s*cfg\s*\(/g;
  for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
    const attributeStart = match.index ?? 0;
    const conditionOpen = view.code.indexOf("(", attributeStart);
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === undefined) continue;
    const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[attributeEnd] !== "]") continue;
    const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
    let delimiter = itemStart;
    while (delimiter < view.code.length && view.code[delimiter] !== "{" && view.code[delimiter] !== ";") delimiter += 1;
    if (view.code[delimiter] === "{") {
      const itemEnd = balancedClose(view.code, delimiter, "{", "}");
      if (itemEnd !== undefined) ranges.push([itemStart, itemEnd]);
    } else if (view.code[delimiter] === ";") ranges.push([itemStart, delimiter]);
  }
  return ranges;
}

function guardSymbol(reference: ParsedReference, source: ReferenceSourceContent): string {
  const declared = source.content.slice(reference.span.start, reference.span.end);
  const separator = reference.kind === "csharp-using" ? "." : "::";
  return (
    declared.split(separator).at(-1) ??
    (reference.targetPath ?? reference.targetCandidates[0] ?? "").split(/[/.]/).at(-2) ??
    ""
  );
}

function strengthForReference(
  reference: ParsedReference,
  sources: readonly ReferenceSourceContent[],
): "strong" | "weak" {
  const source = sources.find((candidate) => candidate.path === reference.sourcePath);
  if (!source) return "strong";
  if (reference.kind === "csharp-using" || reference.kind === "rust-mod" || reference.kind === "rust-use") {
    const symbol = guardSymbol(reference, source);
    const view = syntaxView(source.content);
    const [declarationStart, declarationEnd] = declarationRange(source.content, reference.span.start);
    const uses = [...source.content.matchAll(new RegExp(`\\b${symbol}\\b`, "g"))]
      .map((match) => match.index ?? -1)
      .filter(
        (index) => (index < declarationStart || index >= declarationEnd) && view.code[index] === source.content[index],
      );
    const guards = reference.kind === "csharp-using" ? csharpGuardRanges(view) : rustGuardRanges(view);
    return uses.length > 0 && uses.every((index) => guards.some(([start, end]) => index > start && index < end))
      ? "weak"
      : "strong";
  }
  if (reference.kind !== "import") return "strong";
  const declarationStart = source.content.lastIndexOf("import", reference.span.start);
  const semicolon = source.content.indexOf(";", reference.span.end);
  const newline = source.content.indexOf("\n", reference.span.end);
  const declarationEnd = semicolon === -1 ? newline : newline === -1 ? semicolon : Math.min(semicolon, newline);
  const declaration = source.content.slice(declarationStart, declarationEnd + 1);
  const bindings = localImportBindings(declaration);
  if (bindings.length === 0) return "strong";
  const view = syntaxView(source.content);
  const uses = bindings.flatMap((binding) =>
    [
      ...source.content.matchAll(
        new RegExp(`(^|[^A-Za-z0-9_$])(${binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![A-Za-z0-9_$])`, "g"),
      ),
    ]
      .map((match) => (match.index ?? -1) + (match[1]?.length ?? 0))
      .filter(
        (index) => (index < declarationStart || index > declarationEnd) && view.code[index] === source.content[index],
      ),
  );
  const regions = [
    ...tryCatchRanges(source.content),
    ...conditionalFallbackRanges(view),
    ...fallbackOperandRanges(view.code),
  ];
  return uses.length > 0 && uses.every((index) => regions.some(([start, end]) => index > start && index < end))
    ? "weak"
    : "strong";
}

function referenceGraph(
  parsed: readonly ParsedReference[],
  sources: readonly ReferenceSourceContent[],
): ReferenceGraph {
  const paths = new Set(sources.map((source) => source.path));
  const resolved = parsed.map((reference) => ({
    reference,
    targetPath:
      reference.targetPath ??
      (reference.language === "csharp"
        ? undefined
        : reference.targetCandidates.find((candidate) => paths.has(candidate))),
  }));
  const edges = resolved
    .filter((entry) => entry.targetPath !== undefined)
    .map(({ reference, targetPath }) => ({
      sourcePath: reference.sourcePath,
      targetPath: targetPath ?? "",
      language: reference.language,
      kind: reference.kind,
      strength: strengthForReference(reference, sources),
      span: reference.span,
    }));
  const unresolved = resolved
    .filter((entry) => entry.targetPath === undefined)
    .map(({ reference: { sourcePath, targetCandidates: candidates, language, kind, span, resolution } }) => ({
      sourcePath,
      targetCandidates: candidates,
      language,
      kind,
      span,
      resolution: resolution === "external" ? ("external" as const) : ("unresolved" as const),
    }));
  return { edges, unresolved, complete: true, unavailablePaths: [] };
}

/** Parses and resolves supported TypeScript and JavaScript module references from current source inventory. */
export function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph {
  return referenceGraph(sources.flatMap(parsedModuleReferences), sources);
}

/** Parses JavaScript references while rejecting relative targets outside the canonical repository boundary. */
export function analyzeJavaScriptReferencesWithinBoundary(
  sources: readonly ReferenceSourceContent[],
  boundary: ReferenceContainmentBoundary,
): ReferenceAnalysisResult {
  const inventory = new Set(sources.map((source) => source.path));
  const warnings = new Map<string, AnalysisWarning>();
  const safeReferences = sources.flatMap(parsedModuleReferences).filter((reference) => {
    if (reference.resolution !== "unresolved" || !reference.targetCandidates[0]) return true;
    const literalTarget = reference.targetCandidates[0];
    if (isOutsideRepositoryPath(literalTarget)) {
      warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
      return false;
    }
    const resolvedTarget = reference.targetCandidates.find((candidate) => inventory.has(candidate));
    if (!resolvedTarget) return true;
    const canonicalTarget = boundary.canonicalize(posix.join(boundary.canonicalRepositoryRoot, resolvedTarget));
    if (pathIsWithin(boundary.canonicalRepositoryRoot, canonicalTarget)) return true;
    warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
    return false;
  });
  return {
    graph: referenceGraph(safeReferences, sources),
    warnings: [...warnings.values()].sort((left, right) => compareText(left.path ?? "", right.path ?? "")),
  };
}

/** Parses and resolves the currently supported TypeScript, JavaScript, C#, and Rust reference forms. */
export function analyzeReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph {
  return referenceGraph(
    sources.flatMap((source) => [
      ...parsedModuleReferences(source),
      ...parsedCsharpReferences(source, sources),
      ...parsedRustReferences(source),
    ]),
    sources,
  );
}

/** Regrades current edges between two fossil candidates before scoring. */
export function regradeVestigialEdges(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) =>
      candidatePaths.has(edge.sourcePath) && candidatePaths.has(edge.targetPath)
        ? { ...edge, strength: "vestigial" }
        : { ...edge },
    ),
  };
}

/** Marks candidate reference evidence unavailable when unresolved paths could target it. */
export function markUnresolvedCandidateEvidence(
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): ReferenceGraph {
  const normalize = (path: string) =>
    path
      .replaceAll("\\", "/")
      .replace(/\/(?:index)(?:\.[^/]+)?$/, "")
      .replace(/\.[^/]+$/, "");
  const candidates = [...candidatePaths];
  const basenameCounts = new Map<string, number>();
  for (const path of candidates) {
    const basename = normalize(path).split("/").at(-1) ?? "";
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  }
  const unavailable = new Set(graph.unavailablePaths);
  for (const unresolved of graph.unresolved) {
    if (unresolved.resolution !== "unresolved") continue;
    for (const target of unresolved.targetCandidates) {
      const normalizedTarget = normalize(target);
      if (!normalizedTarget) continue;
      const basename = normalizedTarget.split("/").at(-1) ?? "";
      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        const relevant = normalizedTarget.includes("/")
          ? normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`)
          : normalizedCandidate === normalizedTarget ||
            (basenameCounts.get(basename) === 1 && normalizedCandidate.endsWith(`/${basename}`));
        if (relevant) unavailable.add(candidate);
      }
    }
  }
  const unavailablePaths = [...unavailable].sort(compareText);
  return { ...graph, complete: graph.complete && unavailablePaths.length === 0, unavailablePaths };
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

/** Reads sources below a per-file byte limit while preserving unavailable reference evidence for skipped files. */
export function readBoundedReferenceSources(
  sources: readonly ReferenceCandidate[],
  readMetadata: ReferenceSourceMetadataReader,
  readSource: ReferenceSourceReader,
  maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
): BoundedReferenceReadResult {
  const readableSources: ReferenceSourceContent[] = [];
  const unavailablePaths: string[] = [];
  const warnings: AnalysisWarning[] = [];
  let acceptedBytes = 0;
  let totalLimitReached = false;
  for (const source of sources) {
    if (totalLimitReached || acceptedBytes >= maximumTotalBytes) {
      unavailablePaths.push(source.path);
      warnings.push({
        code: "reference_content_limit",
        message: "Reference source exceeds the total content limit.",
        path: source.path,
      });
      continue;
    }
    try {
      const { byteLength } = readMetadata(source);
      if (byteLength > maximumFileBytes) {
        unavailablePaths.push(source.path);
        warnings.push({
          code: "reference_content_limit",
          message: "Reference source exceeds the per-file content limit.",
          path: source.path,
        });
        continue;
      }
      if (acceptedBytes + byteLength > maximumTotalBytes) {
        unavailablePaths.push(source.path);
        warnings.push({
          code: "reference_content_limit",
          message: "Reference source exceeds the total content limit.",
          path: source.path,
        });
        totalLimitReached = true;
        continue;
      }
      readableSources.push({ ...source, content: readSource(source) });
      acceptedBytes += byteLength;
    } catch {
      unavailablePaths.push(source.path);
      warnings.push({
        code: "reference_unreadable",
        message: "Reference source could not be read.",
        path: source.path,
      });
    }
  }
  unavailablePaths.sort(compareText);
  warnings.sort((left, right) => compareText(left.path ?? "", right.path ?? ""));
  return {
    graph: {
      edges: [],
      unresolved: [],
      complete: unavailablePaths.length === 0,
      unavailablePaths,
    },
    sources: readableSources,
    warnings,
    acceptedBytes,
  };
}
