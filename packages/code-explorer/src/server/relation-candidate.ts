import { createFocusView, type FocusView } from "../navigation/focus-view.js";
import { SessionCapacityError, SessionManager } from "../navigation/session.js";
import type { LanguageAdapter, RelationResult, SymbolIdentity } from "../semantic/api/public-api.js";

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

export function relationCandidate(
  candidate: RelationResult["relations"][number],
  relation: string,
  adapter: LanguageAdapter,
  sessions: SessionManager,
  connectionId: string,
  sessionId: string,
): FollowCandidate {
  const status = adapter.status();
  if ("external" in candidate) {
    return {
      relation,
      relation_source: "semantic",
      backend_name: status.backend_name,
      backend_version: status.backend_version,
      display_name: candidate.external.display_name,
      external: true,
    };
  }
  const symbol = candidate.symbol;
  const view = createFocusView(symbol, {
    declaration: symbol.name,
    visible_symbols: [{ name: symbol.name, symbol_id: symbol.id }],
  });
  if (sessions.addView(connectionId, sessionId, view) !== "ok") throw new SessionCapacityError();
  const handle = view.handles[0]?.handle;
  const sourceRange = "range" in candidate.location ? candidate.location.range : symbol.location.range;
  return {
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
      ? { call_site: { path: candidate.call_site.path.replaceAll("\\", "/"), range: candidate.call_site.range } }
      : {}),
    external: false,
    view_id: view.view_id,
    ...(handle ? { handle } : {}),
    handles: view.handles,
    content: view.content,
  };
}

export function compareRelationCandidates(left: FollowCandidate, right: FollowCandidate): number {
  if (left.external !== right.external) return left.external ? 1 : -1;
  return `${left.path ?? ""}\u0000${left.range?.start.line ?? 0}\u0000${left.range?.start.character ?? 0}\u0000${left.kind ?? ""}\u0000${left.symbol_id ?? left.display_name ?? ""}`.localeCompare(
    `${right.path ?? ""}\u0000${right.range?.start.line ?? 0}\u0000${right.range?.start.character ?? 0}\u0000${right.kind ?? ""}\u0000${right.symbol_id ?? right.display_name ?? ""}`,
  );
}
