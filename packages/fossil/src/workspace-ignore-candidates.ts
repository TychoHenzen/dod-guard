import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type {
  IgnoredWorkspaceCandidate,
} from "./workspace-types/ignored-workspace-candidate.js";
import type {
  WorkspaceFileMetadata,
} from "./workspace-types/workspace-file-metadata.js";

function ignoredCandidate(
  file: WorkspaceFileMetadata,
  ignore: IgnoreProvenance,
): IgnoredWorkspaceCandidate {
  return {
    path: file.path,
    kind: "ignored",
    modifiedTimestampMs: file.modifiedTimestampMs,
    ignore: { rule: ignore.rule, source: ignore.source },
  };
}

export function oldIgnoredWorkspaceCandidates(input: {
  files: readonly WorkspaceFileMetadata[];
  provenance: readonly IgnoreProvenance[];
  analysisTimestampMs: number;
  minimumAgeDays: number;
}): readonly IgnoredWorkspaceCandidate[] {
  const provenanceByPath = new Map(
    input.provenance.map((entry) => [entry.path, entry]),
  );
  const cutoffTimestampMs =
    input.analysisTimestampMs - input.minimumAgeDays * 24 * 60 * 60 * 1_000;
  return input.files.flatMap((file) => {
    const ignore = provenanceByPath.get(file.path);
    if (
      !(
        file.isRegularFile &&
        file.modifiedTimestampMs <= cutoffTimestampMs &&
        ignore
      )
    )
      return [];
    return [ignoredCandidate(file, ignore)];
  });
}
