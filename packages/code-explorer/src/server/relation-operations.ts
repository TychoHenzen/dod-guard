import type {
  LanguageAdapter,
  RelationName,
  RelationResult,
} from "../semantic/api/public-api.js";
import type { BackendOperation } from "./semantic-operations.js";
import { throwBackendLimitFailure } from "./semantic-operations.js";
import {
  compareRelationCandidates,
  mapRelationCandidate,
  retainRelationCandidateView,
  type FollowCandidate,
} from "./relation-candidate.js";
import { SessionManager } from "../navigation/session.js";

export async function collectRelations(
  adapters: readonly LanguageAdapter[],
  relation: RelationName,
  symbolId: string,
  run: BackendOperation,
) {
  const supported = adapters.filter(
    (adapter) => adapter.status().capabilities[relation].state === "ready",
  );
  const replies = await Promise.allSettled(
    supported.map((adapter) =>
      run(() => adapter.request({ operation: relation, symbol_id: symbolId })),
    ),
  );
  const results = replies.flatMap((reply, index) =>
    reply.status === "fulfilled" && reply.value.operation === relation
      ? [{ adapter: supported[index], result: reply.value as RelationResult }]
      : [],
  );
  if (results.length === 0) throwBackendLimitFailure(replies);
  return results;
}

export function mapRelationCandidates(
  result: RelationResult,
  relation: string,
  adapter: LanguageAdapter,
  sessions: SessionManager,
  connectionId: string,
  sessionId: string,
  limit: number,
): FollowCandidate[] {
  return result.relations
    .map((candidate) => mapRelationCandidate(candidate, relation, adapter))
    .sort((left, right) =>
      compareRelationCandidates(left.candidate, right.candidate),
    )
    .slice(0, limit)
    .map((mapped) =>
      retainRelationCandidateView(mapped, sessions, connectionId, sessionId),
    );
}
