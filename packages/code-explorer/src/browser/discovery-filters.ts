export type DiscoveryFilters = {
  path_globs?: readonly string[];
  languages?: readonly string[];
  kinds?: readonly string[];
  content?: "production" | "test" | "all";
  include_generated?: boolean;
};
