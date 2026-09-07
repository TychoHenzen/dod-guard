export type DiscoveryFilters = {
  path_globs?: readonly string[];
  languages?: readonly string[];
  kinds?: readonly string[];
  content?: "all" | "production" | "tests";
  include_generated?: boolean;
  limit?: number;
};
