import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import {
  type CodeExplorerError,
  codeExplorerError,
} from "../navigation/error.js";
import { createEnvelope } from "./envelope.js";
import { invalidViewHandle, staleView } from "./errors.js";
import {
  collectRelations,
  mapRelationCandidates,
} from "./relation-operations.js";
import { schemas } from "./schemas.js";
import type { ServerRuntime } from "./server-runtime.js";

export async function handleFollow(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<ReturnType<typeof createEnvelope> | CodeExplorerError | undefined> {
  const relation = arguments_.relation;
  if (typeof relation !== "string") return;
  const follow = schemas.code_follow.parse(arguments_);
  const resolved = runtime.sessions.resolveHandle(
    runtime.connectionId,
    follow.session_id,
    follow.view_id,
    follow.handle,
    freshness.current_generation,
  );
  if (resolved.state === "stale_view") {
    if (resolved.viewGeneration === undefined) return staleView();
    return codeExplorerError("stale_view", {
      view_generation: resolved.viewGeneration,
      current_generation:
        resolved.currentGeneration ?? freshness.current_generation,
    });
  }
  if (resolved.state !== "ok") return invalidViewHandle();
  const semanticRelation =
    follow.relation === "type" ? "type_definition" : follow.relation;
  const replies = await collectRelations(
    runtime.options.adapters ?? [],
    semanticRelation,
    resolved.symbolId,
    (operation) => runtime.backendRequests.run(follow.session_id, operation),
  );
  if (replies.length === 0)
    return createEnvelope(freshness, "unavailable_relation", { relation });
  const { adapter, result } = replies[0];
  const candidates = mapRelationCandidates(
    result,
    relation,
    adapter,
    runtime.sessions,
    runtime.connectionId,
    follow.session_id,
    Math.min(follow.limit ?? 50, 200),
  );
  if (relation === "definition") {
    const local = candidates.find((candidate) => candidate.external === false);
    if (local)
      return createEnvelope(freshness, "ready", {
        focus: local,
        source_location: local.range,
      });
  }
  return createEnvelope(freshness, "ready", { relation, candidates });
}
