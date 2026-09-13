import { createFocusView } from "../navigation/focus-view.js";
import {
  SessionCapacityError,
  type SessionManager,
} from "../navigation/session.js";
import type {
  LanguageAdapter,
  RelationResult,
} from "../semantic/api/public-api.js";
import {
  type FollowCandidate,
  mapRelationCandidate,
} from "./relation-candidate.js";
import { compareRelationCandidates } from "./relation-order.js";

type MapRelationOptions = {
  result: RelationResult;
  relation: string;
  adapter: LanguageAdapter;
  sessions: SessionManager;
  connectionId: string;
  sessionId: string;
  limit: number;
};

export function mapRelationCandidates(
  {
    result,
    relation,
    adapter,
    sessions,
    connectionId,
    sessionId,
    limit,
  }: MapRelationOptions,
): FollowCandidate[] {
  return result.relations
    .map((candidate) => mapRelationCandidate(candidate, relation, adapter))
    .sort((left, right) =>
      compareRelationCandidates(left.candidate, right.candidate),
    )
    .slice(0, limit)
    .map((mapped) =>
      retainRelationCandidateView({
        mapped,
        sessions,
        connectionId,
        sessionId,
      }),
    );
}

function retainRelationCandidateView({
  mapped,
  sessions,
  connectionId,
  sessionId,
}: {
  mapped: ReturnType<typeof mapRelationCandidate>;
  sessions: SessionManager;
  connectionId: string;
  sessionId: string;
}): FollowCandidate {
  if (!mapped.symbol) return mapped.candidate;
  const view = createFocusView(mapped.symbol, {
    declaration: mapped.symbol.name,
    visible_symbols: [
      { name: mapped.symbol.name, symbol_id: mapped.symbol.id },
    ],
  });
  if (sessions.addView(connectionId, sessionId, view) !== "ok")
    throw new SessionCapacityError();
  return {
    ...mapped.candidate,
    view_id: view.view_id,
    ...(view.handles[0]?.handle ? { handle: view.handles[0].handle } : {}),
    handles: view.handles,
    content: view.content,
  };
}
