/** Public compatibility boundary for workspace-debris evidence helpers. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"];
export const IGNORED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"];
export const CHECK_IGNORE_ARGUMENTS = ["check-ignore", "-z", "-v", "--stdin"];
export { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
export { inspectWorkspaceFileMetadata, inspectWorkspaceFileMetadataWithWarnings, parseNulDelimitedPaths, } from "./workspace-metadata.js";
export { oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, parseVerboseCheckIgnore } from "./workspace-ignore.js";
export { hasInboundWorkspaceUsage, omitUsedWorkspaceCandidates } from "./workspace-usage.js";
export { workspaceDebrisFinding } from "./workspace-finding.js";
//# sourceMappingURL=workspace-debris.js.map