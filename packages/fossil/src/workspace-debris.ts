import { posix } from "node:path";
import { analyzeReferences, type ReferenceSourceContent } from "./ref-analyzer.js";
import type { IgnoreSource, WorkspaceDebrisFinding } from "./types.js";

/** Exact Git arguments for non-ignored, NUL-delimited untracked paths. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"] as const;
/** Exact Git arguments for ignored, NUL-delimited workspace paths. */
export const IGNORED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"] as const;
/** Exact Git arguments for NUL-delimited verbose ignore provenance. */
export const CHECK_IGNORE_ARGUMENTS = ["check-ignore", "-z", "-v", "--stdin"] as const;
const DEPENDENCY_STORE_SEGMENTS = new Set(["node_modules", "vendor", ".pnpm-store", ".yarn", ".cargo"]);
const SENSITIVE_DIRECTORY_SEGMENTS = new Set([".aws", ".ssh", ".gnupg", ".kube"]);
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".kdbx"] as const;

/** Regular-file metadata captured after workspace discovery. */
export interface WorkspaceFileMetadata {
  readonly path: string;
  readonly isRegularFile: boolean;
  /** No-follow metadata indicates this path is a symbolic link. */
  readonly isSymbolicLink?: boolean;
  /** No-follow metadata indicates this path is a Windows junction. */
  readonly isJunction?: boolean;
  readonly modifiedTimestampMs: number;
}

/** Injected metadata reader for workspace paths that pass pre-inspection boundaries. */
export type WorkspaceFileMetadataReader = (path: string) => WorkspaceFileMetadata;

/** An old untracked regular file eligible for later workspace-debris evidence checks. */
export interface UntrackedWorkspaceCandidate {
  readonly path: string;
  readonly kind: "untracked";
  readonly modifiedTimestampMs: number;
}

/** Matching ignore-rule provenance for one ignored workspace path. */
export interface IgnoreProvenance {
  readonly path: string;
  readonly rule: string;
  readonly source: IgnoreSource;
}

/** An old ignored regular file eligible for later workspace-debris evidence checks. */
export interface IgnoredWorkspaceCandidate {
  readonly path: string;
  readonly kind: "ignored";
  readonly modifiedTimestampMs: number;
  readonly ignore: { readonly rule: string; readonly source: IgnoreSource };
}

/** Parses Git's NUL-delimited path output without changing valid path characters. */
export function parseNulDelimitedPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isDependencyStorePath(path: string): boolean {
  return normalizePath(path)
    .split("/")
    .some((segment) => DEPENDENCY_STORE_SEGMENTS.has(segment));
}

function isSensitiveWorkspacePath(path: string): boolean {
  const segments = normalizePath(path)
    .split("/")
    .map((segment) => segment.toLowerCase());
  const name = segments.at(-1) ?? "";
  return (
    segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment)) ||
    SENSITIVE_BASENAMES.has(name) ||
    name.startsWith(".env.") ||
    name.startsWith("credentials") ||
    SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

/** Reads metadata only for discovered paths outside known dependency-store segments. */
export function inspectWorkspaceFileMetadata(
  paths: readonly string[],
  readMetadata: WorkspaceFileMetadataReader,
): readonly WorkspaceFileMetadata[] {
  const metadata: WorkspaceFileMetadata[] = [];
  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (isDependencyStorePath(normalizedPath) || isSensitiveWorkspacePath(normalizedPath)) continue;
    const file = readMetadata(normalizedPath);
    if (file.isSymbolicLink || file.isJunction) continue;
    metadata.push({ ...file, path: normalizedPath });
  }
  return metadata;
}

function classifyIgnoreSource(sourcePath: string, globalExcludePath: string | undefined): IgnoreSource {
  const normalizedSource = normalizePath(sourcePath);
  if (normalizedSource === ".git/info/exclude" || normalizedSource.endsWith("/.git/info/exclude"))
    return "local-exclude";
  if (globalExcludePath && normalizePath(globalExcludePath) === normalizedSource) return "global-exclude";
  if (!(normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource))) return "repository";
  return "unknown";
}

/** Parses NUL-delimited source, line, rule, and path records from verbose Git ignore output. */
export function parseVerboseCheckIgnore(output: string, globalExcludePath?: string): readonly IgnoreProvenance[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const provenance: IgnoreProvenance[] = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const sourcePath = fields[index];
    const rule = fields[index + 2];
    const path = fields[index + 3];
    if (!(sourcePath && rule !== undefined && path !== undefined)) continue;
    provenance.push({ path, rule, source: classifyIgnoreSource(sourcePath, globalExcludePath) });
  }
  return provenance;
}

/** Selects old regular untracked files before later ignore and usage-evidence checks. */
export function oldUntrackedWorkspaceCandidates(
  files: readonly WorkspaceFileMetadata[],
  analysisTimestampMs: number,
  minimumAgeDays: number,
): readonly UntrackedWorkspaceCandidate[] {
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
  return files
    .filter((file) => file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs)
    .map(({ path, modifiedTimestampMs }) => ({ path, kind: "untracked", modifiedTimestampMs }));
}

/** Selects old regular ignored files and preserves their matching Git ignore rule provenance. */
export function oldIgnoredWorkspaceCandidates(
  files: readonly WorkspaceFileMetadata[],
  provenance: readonly IgnoreProvenance[],
  analysisTimestampMs: number,
  minimumAgeDays: number,
): readonly IgnoredWorkspaceCandidate[] {
  const provenanceByPath = new Map(provenance.map((entry) => [entry.path, entry]));
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
  return files.flatMap((file) => {
    const ignore = provenanceByPath.get(file.path);
    if (!(file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs && ignore)) return [];
    return [
      {
        path: file.path,
        kind: "ignored" as const,
        modifiedTimestampMs: file.modifiedTimestampMs,
        ignore: { rule: ignore.rule, source: ignore.source },
      },
    ];
  });
}

function normalizedRepositoryPath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function basename(path: string): string {
  return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}

function sourceStringValues(content: string): readonly string[] {
  const values: string[] = [];
  const matcher = /(["'`])([^"'`\r\n]+)\1/g;
  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const value = match[2];
    if (value !== undefined) values.push(normalizedRepositoryPath(value));
  }
  return values;
}

/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export function hasInboundWorkspaceUsage(
  candidatePath: string,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): boolean {
  const normalizedCandidate = normalizedRepositoryPath(candidatePath);
  const graph = analyzeReferences(sources);
  if (
    graph.edges.some(
      (edge) =>
        normalizedRepositoryPath(edge.targetPath) === normalizedCandidate &&
        normalizedRepositoryPath(edge.sourcePath) !== normalizedCandidate,
    )
  )
    return true;
  const candidateBasename = basename(normalizedCandidate);
  const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
  const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
  return sources.some((source) => {
    if (normalizedRepositoryPath(source.path) === normalizedCandidate) return false;
    return sourceStringValues(source.content).some(
      (value) => value === normalizedCandidate || (basenameCount === 1 && value === candidateBasename),
    );
  });
}

/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export function omitUsedWorkspaceCandidates<T extends { readonly path: string }>(
  candidates: readonly T[],
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): readonly T[] {
  return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}

/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export function workspaceDebrisFinding(
  candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
  analysisBoundary: string,
  unobservedMechanisms: readonly string[],
): WorkspaceDebrisFinding | undefined {
  if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths)) return undefined;
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path: candidate.path,
    kind: candidate.kind,
    modifiedTimestampMs: candidate.modifiedTimestampMs,
    ageSource: "mtime",
    ageUncertainty:
      "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
    ignore: "ignore" in candidate ? candidate.ignore : undefined,
    detectedReferenceEvidence: [],
    analysisBoundary,
    unobservedReferenceMechanisms: unobservedMechanisms,
  };
}
