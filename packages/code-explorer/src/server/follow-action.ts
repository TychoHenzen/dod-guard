import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import { type CodeExplorerError } from "../navigation/error.js";
import type { RelationName } from "../semantic/api/public-api.js";
import { collectRelations } from "./collect-relations.js";
import { type CodeExplorerEnvelope, createEnvelope } from "./envelope.js";
import { createFollowEnvelope } from "./follow-result.js";
import { resolveFollowTarget } from "./follow-target.js";
import type { FollowCandidate } from "./relation-candidate.js";
import { mapRelationCandidates } from "./relation-operations.js";
import { schemas } from "./schemas.js";
import type { ServerRuntime } from "./server-runtime.js";

async function loadFollowCandidates({
  runtime,
  follow,
  relation,
  symbolId,
}: {
  runtime: ServerRuntime;
  follow: ReturnType<typeof schemas.code_follow.parse>;
  relation: string;
  symbolId: string;
}): Promise<FollowCandidate[] | undefined> {
  const replies = await collectRelations({
    adapters: runtime.options.adapters ?? [],
    relation: semanticRelation(follow.relation),
    symbolId,
    run: (operation) =>
      runtime.backendRequests.run(follow.session_id, operation),
  });
  return followCandidatesFromReplies({ runtime, follow, relation, replies });
}

function semanticRelation(
  relation: ReturnType<typeof schemas.code_follow.parse>["relation"],
): RelationName {
  return relation === "type" ? "type_definition" : relation;
}

function followCandidatesFromReplies({
  runtime,
  follow,
  relation,
  replies,
}: {
  runtime: ServerRuntime;
  follow: ReturnType<typeof schemas.code_follow.parse>;
  relation: string;
  replies: Awaited<ReturnType<typeof collectRelations>>;
}): FollowCandidate[] | undefined {
  if (replies.length === 0) return;
  const { adapter, result } = replies[0];
  return mapRelationCandidates({
    result,
    relation,
    adapter,
    sessions: runtime.sessions,
    connectionId: runtime.connectionId,
    sessionId: follow.session_id,
    limit: Math.min(follow.limit ?? 50, 200),
  });
}

export async function handleFollow(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): Promise<CodeExplorerEnvelope | CodeExplorerError | undefined> {
  const relation = arguments_.relation;
  if (typeof relation !== "string") return;
  const follow = schemas.code_follow.parse(arguments_);
  const target = resolveFollowTarget({
    runtime,
    sessionId: follow.session_id,
    viewId: follow.view_id,
    handle: follow.handle,
    generation: freshness.current_generation,
  });
  if ("error" in target) return target.error;
  const candidates = await loadFollowCandidates({
    runtime,
    follow,
    relation,
    symbolId: target.symbolId,
  });
  if (!candidates)
    return createEnvelope(freshness, "unavailable_relation", { relation });
  return createFollowEnvelope(relation, candidates, freshness);
}
