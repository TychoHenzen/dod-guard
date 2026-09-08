/** Filters repository-relative discovery paths with bounded `*`, `?`, and `**` caller exclusion globs. */
export declare function filterWorkspaceDiscoveryPaths(paths: readonly string[], excludePatterns: readonly string[]): readonly string[];
