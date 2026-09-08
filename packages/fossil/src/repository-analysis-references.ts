import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeReferences,
  markUnresolvedCandidateEvidence,
  readStableReferenceSources,
  regradeVestigialEdges,
  unsupportedCandidateReferenceGraph,
  type ReferenceCandidate,
} from "./ref-analyzer.js";
import type { SourceLanguage } from "./types.js";

function languageForPath(path: string): SourceLanguage {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".ts", ".tsx"].includes(extension)) return "typescript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if (extension === ".cs") return "csharp";
  if (extension === ".rs") return "rust";
  return "unsupported";
}

function inspectReferenceSource(root: string, source: ReferenceCandidate) {
  const fullPath = join(root, source.path);
  const metadata = lstatSync(fullPath);
  return {
    identity: `${metadata.dev}:${metadata.ino}`,
    isRegularFile: metadata.isFile(),
    byteLength: metadata.size,
    canonicalPath: realpathSync(fullPath),
  };
}

function referenceCandidates(paths: readonly string[]): ReferenceCandidate[] {
  return paths.map((path) => ({
    path,
    language: languageForPath(path),
  }));
}

function readReferenceSources(
  root: string,
  candidates: readonly ReferenceCandidate[],
) {
  const supported = candidates.filter(
    (candidate) => candidate.language !== "unsupported",
  );
  const readSource = (source: ReferenceCandidate) =>
    readFileSync(join(root, source.path), "utf8");
  const reads = readStableReferenceSources({
    sources: supported,
    boundary: {
      inspect: (source) => inspectReferenceSource(root, source),
      read: readSource,
    },
  });
  return reads;
}

function completeReferenceGraph(
  reads: ReturnType<typeof readReferenceSources>,
  unsupported: ReturnType<typeof unsupportedCandidateReferenceGraph>,
) {
  const graph = analyzeReferences(reads.sources);
  return {
    ...graph,
    complete: reads.graph.complete && unsupported.complete,
    unavailablePaths: [
      ...new Set([
        ...reads.graph.unavailablePaths,
        ...unsupported.unavailablePaths,
      ]),
    ].sort(),
  };
}

export function referenceSources(root: string, paths: readonly string[]) {
  const candidates = referenceCandidates(paths);
  const reads = readReferenceSources(root, candidates);
  const unsupported = unsupportedCandidateReferenceGraph(candidates);
  return {
    sources: reads.sources,
    warnings: reads.warnings,
    acceptedBytes: reads.acceptedBytes,
    graph: completeReferenceGraph(reads, unsupported),
  };
}

export { markUnresolvedCandidateEvidence, regradeVestigialEdges };
