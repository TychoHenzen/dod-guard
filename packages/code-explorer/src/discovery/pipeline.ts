import type { ProjectRoot } from "../semantic/api/public-api.js";
import {
  type ClassificationConfigStatus,
  classifyProjectPath,
  loadClassificationConfig,
} from "./classification.js";
import type { DiscoveryPipeline } from "./discovery-pipeline.js";
import { collectPipelineFiles } from "./pipeline-files.js";
import { createPipelineSearch } from "./pipeline-search.js";

export type { DiscoveryFilters } from "./discovery-filters.js";
export type { DiscoveryPipeline } from "./discovery-pipeline.js";
export type { DiscoveryResult } from "./discovery-result.js";
export type { DiscoverySearchResponse } from "./discovery-search-response.js";

/** Loads classification once for this project generation and filters before
 * matching or limiting.
 */
export function createDiscoveryPipeline(root: ProjectRoot): DiscoveryPipeline {
  const loaded = loadClassificationConfig(root.canonicalPath);
  const candidates = collectPipelineFiles(root, loaded.config);
  const search = createPipelineSearch({
    root,
    config: loaded.config,
    candidates,
  });
  return {
    status: (): ClassificationConfigStatus => loaded.status,
    search: search.search,
    searchResult: search.searchResult,
  };
}
