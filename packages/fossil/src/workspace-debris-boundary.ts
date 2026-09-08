/** Explicit compatibility boundary for workspace-debris evidence helpers. */
export {
  CHECK_IGNORE_ARGUMENTS,
  filterWorkspaceDiscoveryPaths,
  hasInboundWorkspaceUsage,
  IGNORED_DISCOVERY_ARGUMENTS,

  inspectWorkspaceFileMetadata,
  inspectWorkspaceFileMetadataWithWarnings,
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,

  omitUsedWorkspaceCandidates,
  parseNulDelimitedPaths,

  parseVerboseCheckIgnore,
  UNTRACKED_DISCOVERY_ARGUMENTS,
  workspaceDebrisFinding,
} from "./workspace-debris.js";
export type { IgnoredWorkspaceCandidate } from "./workspace-debris.js";
export type { IgnoreProvenance } from "./workspace-debris.js";
export type { UntrackedWorkspaceCandidate } from "./workspace-debris.js";
export type { WorkspaceFileMetadata } from "./workspace-debris.js";
export type { WorkspaceFileMetadataReader } from "./workspace-debris.js";
export type { WorkspaceMetadataInspectionResult } from "./workspace-debris.js";
