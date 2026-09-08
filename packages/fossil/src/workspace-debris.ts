/** Public compatibility boundary for workspace-debris evidence helpers. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = [
  "ls-files",
  "-z",
  "--others",
  "--exclude-standard",
] as const;
export const IGNORED_DISCOVERY_ARGUMENTS = [
  "ls-files",
  "-z",
  "--others",
  "--ignored",
  "--exclude-standard",
] as const;
export const CHECK_IGNORE_ARGUMENTS = [
  "check-ignore",
  "-z",
  "-v",
  "--stdin",
] as const;

export { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
export {
  inspectWorkspaceFileMetadata,
  inspectWorkspaceFileMetadataWithWarnings,
  parseNulDelimitedPaths,
} from "./workspace-metadata.js";
export {
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,
  parseVerboseCheckIgnore,
} from "./workspace-ignore.js";
export {
  hasInboundWorkspaceUsage,
  omitUsedWorkspaceCandidates,
} from "./workspace-usage.js";
export { workspaceDebrisFinding } from "./workspace-finding.js";
export type { IgnoredWorkspaceCandidate } from "./workspace-types/index.js";
export type { IgnoreProvenance } from "./workspace-types/index.js";
export type { UntrackedWorkspaceCandidate } from "./workspace-types/index.js";
export type { WorkspaceFileMetadata } from "./workspace-types/index.js";
export type { WorkspaceFileMetadataReader } from "./workspace-types/index.js";
export type {
  WorkspaceMetadataInspectionResult,
} from "./workspace-types/index.js";
