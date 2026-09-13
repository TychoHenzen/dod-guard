import {
  type LandmarkDiscovery,
  landmarksNotReady,
} from "../discovery/landmarks.js";
import { normalizeDiscoveryQuery } from "../discovery/matcher.js";
import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import {
  type CodeExplorerError,
  codeExplorerError,
} from "../navigation/error.js";
import { ProjectPathError } from "../semantic/api/public-api.js";
import { type CodeExplorerEnvelope, createEnvelope } from "./envelope.js";
import { schemas } from "./schemas.js";
import { collectSemanticSymbols } from "./semantic-operations.js";
import type { ServerRuntime } from "./server-runtime.js";

export async function handleSearch(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const search = schemas.code_search.parse(arguments_);
  if (normalizeDiscoveryQuery(search.query).length === 0)
    return searchLandmarks(runtime, freshness);
  return searchSemantic(runtime, search, freshness);
}

function searchLandmarks(
  runtime: ServerRuntime,
  freshness: FreshnessStatus,
): CodeExplorerEnvelope {
  const currentLandmarks: LandmarkDiscovery =
    runtime.state.landmarks ?? landmarksNotReady();
  return createEnvelope(
    freshness,
    currentLandmarks.state === "ready" ? "ready" : "landmarks_not_ready",
    {
      landmarks: currentLandmarks.landmarks,
      landmark_state: currentLandmarks.state,
    },
  );
}

async function searchSemantic(
  runtime: ServerRuntime,
  search: ReturnType<typeof schemas.code_search.parse>,
  freshness: FreshnessStatus,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const semantic = await collectSemanticSymbols(
    runtime.options.adapters ?? [],
    search.query,
    (operation) => runtime.backendRequests.run(undefined, operation),
  );
  const discovery = runtime.state.discovery;
  if (!discovery) return createEnvelope(freshness, "ready", {});
  return searchDiscovery({ discovery, search, semantic, freshness });
}

function isPathOutsideProject(error: unknown): error is ProjectPathError {
  return (
    error instanceof ProjectPathError && error.code === "path_outside_project"
  );
}

function searchDiscovery({
  discovery,
  search,
  semantic,
  freshness,
}: {
  discovery: NonNullable<ServerRuntime["state"]["discovery"]>;
  search: ReturnType<typeof schemas.code_search.parse>;
  semantic: Awaited<ReturnType<typeof collectSemanticSymbols>>;
  freshness: FreshnessStatus;
}): CodeExplorerEnvelope | CodeExplorerError {
  let results: ReturnType<typeof discovery.searchResult>;
  try {
    results = discovery.searchResult(search.query, search, semantic.symbols);
    if (results.candidates.length === 0 && semantic.failure)
      throw semantic.failure;
    return createEnvelope(freshness, "ready", results);
  } catch (error) {
    if (isPathOutsideProject(error))
      return codeExplorerError("path_outside_project");
    throw error;
  }
}
