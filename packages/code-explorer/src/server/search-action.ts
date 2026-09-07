import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import { type CodeExplorerError, codeExplorerError } from "../navigation/error.js";
import { ProjectPathError } from "../semantic/api/public-api.js";
import { type LandmarkDiscovery, landmarksNotReady } from "../discovery/landmarks.js";
import { normalizeDiscoveryQuery } from "../discovery/matcher.js";
import { collectSemanticSymbols } from "./semantic-operations.js";
import { createEnvelope, type CodeExplorerEnvelope } from "./envelope.js";
import type { ServerRuntime } from "./server-runtime.js";
import { schemas } from "./schemas.js";

export async function handleSearch(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const search = schemas.code_search.parse(arguments_);
  if (normalizeDiscoveryQuery(search.query).length === 0) {
    const currentLandmarks: LandmarkDiscovery = runtime.state.landmarks ?? landmarksNotReady();
    return createEnvelope(
      freshness,
      currentLandmarks.state === "ready" ? "ready" : "landmarks_not_ready",
      { landmarks: currentLandmarks.landmarks, landmark_state: currentLandmarks.state },
    );
  }
  const semantic = await collectSemanticSymbols(runtime.options.adapters ?? [], search.query, (operation) =>
    runtime.backendRequests.run(undefined, operation),
  );
  const discovery = runtime.state.discovery;
  if (!discovery) return createEnvelope(freshness, "ready", {});
  let results: ReturnType<typeof discovery.searchResult>;
  try {
    results = discovery.searchResult(search.query, search, semantic.symbols);
    if (results.candidates.length === 0 && semantic.failure) throw semantic.failure;
  } catch (error) {
    if (error instanceof ProjectPathError && error.code === "path_outside_project") return codeExplorerError("path_outside_project");
    throw error;
  }
  return createEnvelope(freshness, "ready", results);
}
