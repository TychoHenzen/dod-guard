import type { FocusView } from "../navigation/focus-view.js";
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

export function mapRelationCandidate(
  candidate: RelationResult["relations"][number],
  relation: string,
  adapter: LanguageAdapter,
): { candidate: FollowCandidate; symbol?: SymbolIdentity } {
  const status = adapter.status();
  const base = {
    relation,
    relation_source: "semantic" as const,
    backend_name: status.backend_name,
    backend_version: status.backend_version,
  };
  if ("external" in candidate) {
    return {
      candidate: {
        ...base,
        display_name: candidate.external.display_name,
        external: true,
      },
    };
  }
  const symbol = candidate.symbol;
  return {
    symbol,
    candidate: {
      ...base,
      symbol_id: symbol.id,
      display_name: symbol.name,
      path: symbol.location.path.replaceAll("\\", "/"),
      kind: symbol.kind,
      range:
        "range" in candidate.location
          ? candidate.location.range
          : symbol.location.range,
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
