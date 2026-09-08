/** Public compatibility boundary for workspace-debris evidence helpers. */
export declare const UNTRACKED_DISCOVERY_ARGUMENTS: readonly ["ls-files", "-z", "--others", "--exclude-standard"];
export declare const IGNORED_DISCOVERY_ARGUMENTS: readonly ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"];
export declare const CHECK_IGNORE_ARGUMENTS: readonly ["check-ignore", "-z", "-v", "--stdin"];
export { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
export { inspectWorkspaceFileMetadata, inspectWorkspaceFileMetadataWithWarnings, parseNulDelimitedPaths, } from "./workspace-metadata.js";
export { oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, parseVerboseCheckIgnore } from "./workspace-ignore.js";
export { hasInboundWorkspaceUsage, omitUsedWorkspaceCandidates } from "./workspace-usage.js";
export { workspaceDebrisFinding } from "./workspace-finding.js";
export type { IgnoredWorkspaceCandidate } from "./workspace-types/index.js";
export type { IgnoreProvenance } from "./workspace-types/index.js";
export type { UntrackedWorkspaceCandidate } from "./workspace-types/index.js";
export type { WorkspaceFileMetadata } from "./workspace-types/index.js";
export type { WorkspaceFileMetadataReader } from "./workspace-types/index.js";
export type { WorkspaceMetadataInspectionResult } from "./workspace-types/index.js";
