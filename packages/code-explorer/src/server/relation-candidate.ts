import { createFocusView, type FocusView } from "../navigation/focus-view.js";
import { SessionCapacityError, SessionManager } from "../navigation/session.js";
import type {
  LanguageAdapter,
  RelationResult,
  SymbolIdentity,
} from "../semantic/api/public-api.js";

export type FollowCandidate = {
  relation: string;
  relation_source: "semantic";
  backend_name: string;
  backend_version: string;
  external: boolean;
  symbol_id?: string;
  display_name?: string;
  path?: string;
  kind?: string;
  range?: SymbolIdentity["location"]["range"];
  call_site?: SymbolIdentity["location"];
  view_id?: string;
  handle?: string;
  handles?: FocusView["handles"];
  content?: FocusView["content"];
};

export type MappedRelationCandidate = {
  candidate: FollowCandidate;
  symbol?: SymbolIdentity;
};

export function mapRelationCandidate(
  candidate: RelationResult["relations"][number],
  relation: string,
  adapter: LanguageAdapter,
): MappedRelationCandidate {
  const status = adapter.status();
  if ("external" in candidate) {
    return {
      candidate: {
        relation,
        relation_source: "semantic",
        backend_name: status.backend_name,
        backend_version: status.backend_version,
        display_name: candidate.external.display_name,
        external: true,
      },
    };
  }
  const symbol = candidate.symbol;
  const sourceRange =
    "range" in candidate.location
      ? candidate.location.range
      : symbol.location.range;
  return {
    symbol,
    candidate: {
      relation,
      relation_source: "semantic",
      backend_name: status.backend_name,
      backend_version: status.backend_version,
      symbol_id: symbol.id,
      display_name: symbol.name,
      path: symbol.location.path.replaceAll("\\", "/"),
      kind: symbol.kind,
      range: sourceRange,
      ...(candidate.call_site
        ? {
            call_site: {
              path: candidate.call_site.path.replaceAll("\\", "/"),
              range: candidate.call_site.range,
            },
          }
        : {}),
      external: false,
    },
  };
}

export function relationCandidate(
  candidate: RelationResult["relations"][number],
  relation: string,
  adapter: LanguageAdapter,
  sessions: SessionManager,
  connectionId: string,
  sessionId: string,
): FollowCandidate {
  return retainRelationCandidateView(
    mapRelationCandidate(candidate, relation, adapter),
    sessions,
    connectionId,
    sessionId,
  );
}

export function retainRelationCandidateView(
  mapped: MappedRelationCandidate,
  sessions: SessionManager,
  connectionId: string,
  sessionId: string,
): FollowCandidate {
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

export function compareRelationCandidates(
  left: FollowCandidate,
  right: FollowCandidate,
): number {
  if (left.external !== right.external) return left.external ? 1 : -1;
  return relationCandidateSortKey(left).localeCompare(
    relationCandidateSortKey(right),
  );
}

function relationCandidateSortKey(candidate: FollowCandidate): string {
  return [
    candidate.path ?? "",
    candidate.range?.start.line ?? 0,
    candidate.range?.start.character ?? 0,
    candidate.kind ?? "",
    candidate.symbol_id ?? candidate.display_name ?? "",
  ].join("\u0000");
}
