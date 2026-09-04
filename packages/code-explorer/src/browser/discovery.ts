export type DiscoveryFilters = {
  path_globs?: readonly string[];
  languages?: readonly string[];
  kinds?: readonly string[];
  content?: "production" | "test" | "all";
  include_generated?: boolean;
};

type DiscoveryCandidateMatch = {
  identity?: string;
  match_class: string;
  match_score: number;
  classification?: string;
  path: string;
};
export type DiscoveryCandidate =
  | (DiscoveryCandidateMatch & { type: "file" })
  | (DiscoveryCandidateMatch & { type: "symbol"; name: string; kind: string });

export type BrowserLandmark = { symbol_id?: string; name: string; path: string; kind: string };
export type BrowserLandmarkGroup = { group: string; items: readonly BrowserLandmark[] };
export type DiscoveryReply = {
  data: {
    candidates?: readonly DiscoveryCandidate[];
    omitted_count?: number;
    omitted_candidate_count?: number;
    refinement_guidance?: string;
  };
};

export type DiscoveryState = {
  query: string;
  filters: DiscoveryFilters;
  candidates: readonly DiscoveryCandidate[];
  landmarks: readonly BrowserLandmarkGroup[];
  omittedCount: number;
  refinementGuidance?: string;
  mode: "landmarks" | "results";
  areaState: "not_loaded" | "loading" | "empty" | "unavailable" | "stale" | "failed" | "ready";
  error?: string;
};

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Preserves the service result order and fields without browser-side fuzzy scoring or reranking. */
export class BrowserDiscoveryController {
  private current: DiscoveryState;

  constructor(
    private readonly searchCore: (request: Record<string, unknown>) => Promise<DiscoveryReply>,
    landmarks: readonly BrowserLandmarkGroup[] = [],
  ) {
    this.current = {
      query: "",
      filters: {},
      candidates: [],
      landmarks,
      omittedCount: 0,
      mode: "landmarks",
      areaState: "not_loaded",
    };
  }

  state(): DiscoveryState {
    return this.current;
  }

  async search(query: string, filters: DiscoveryFilters = {}): Promise<DiscoveryState> {
    const normalized = query.trim();
    if (normalized.length === 0) {
      this.current = {
        ...this.current,
        query: "",
        filters,
        candidates: [],
        omittedCount: 0,
        refinementGuidance: undefined,
        mode: "landmarks",
        areaState: "not_loaded",
        error: undefined,
      };
      return this.current;
    }
    const request: Record<string, unknown> = { query: normalized };
    if (filters.path_globs) request.path_globs = [...filters.path_globs];
    if (filters.languages) request.languages = [...filters.languages];
    if (filters.kinds) request.kinds = [...filters.kinds];
    if (filters.content) request.content = filters.content;
    if (filters.include_generated !== undefined) request.include_generated = filters.include_generated;
    this.current = { ...this.current, query: normalized, filters, areaState: "loading", error: undefined };
    try {
      const reply = await this.searchCore(request);
      const candidates = reply.data.candidates ?? [];
      this.current = {
        ...this.current,
        candidates,
        omittedCount: reply.data.omitted_candidate_count ?? reply.data.omitted_count ?? 0,
        refinementGuidance: reply.data.refinement_guidance,
        mode: "results",
        areaState: candidates.length === 0 ? "empty" : "ready",
      };
    } catch {
      this.current = { ...this.current, mode: "results", areaState: "failed", error: "backend_unavailable" };
    }
    return this.current;
  }
}

function renderLandmarks(landmarks: readonly BrowserLandmarkGroup[]): string {
  return landmarks
    .map(
      (group) =>
        `<section class="landmark-group"><h3>${escapeText(group.group)}</h3><ul>${group.items
          .map(
            (item) =>
              `<li>${item.symbol_id ? `<button type="button" data-symbol-id="${escapeText(item.symbol_id)}">${escapeText(item.name)}</button>` : escapeText(item.name)} <span>${escapeText(item.kind)} · ${escapeText(item.path)}</span></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("");
}

/** Renders only service-provided fields. Candidate order is intentionally unchanged. */
export function renderDiscovery(state: DiscoveryState): string {
  if (state.areaState !== "ready" && state.areaState !== "empty" && state.areaState !== "not_loaded")
    return `<section data-discovery="results" data-state="${state.areaState}">${state.error ?? state.areaState}</section>`;
  if (state.mode === "landmarks")
    return `<section data-discovery="landmarks">${renderLandmarks(state.landmarks)}</section>`;
  const candidates = state.candidates
    .map((candidate) => {
      const name = candidate.type === "file" ? (candidate.path.split("/").at(-1) ?? candidate.path) : candidate.name;
      const kind = candidate.type === "file" ? "file" : candidate.kind;
      const label = candidate.identity
        ? `<button type="button" data-symbol-id="${escapeText(candidate.identity)}">${escapeText(name)}</button>`
        : `<strong>${escapeText(name)}</strong>`;
      return `<li data-match-class="${escapeText(candidate.match_class)}">${label} <span>${escapeText(candidate.match_class)} ${candidate.match_score}</span> <span>${escapeText(candidate.path)} · ${escapeText(kind)}</span></li>`;
    })
    .join("");
  const omitted = state.omittedCount > 0 ? `<p>${state.omittedCount} omitted</p>` : "";
  const guidance = state.refinementGuidance ? `<p>${escapeText(state.refinementGuidance)}</p>` : "";
  return `<section data-discovery="results" data-state="${state.areaState}"><ul>${candidates}</ul>${omitted}${guidance}</section>`;
}
