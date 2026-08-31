export type RelationName = "definition" | "references" | "callers" | "callees" | "type" | "implementations";
export type RelationCandidate = { name: string; external: boolean; local_handle?: string };
export type RelationReply = {
  state: string;
  data?: { candidates?: readonly RelationCandidate[]; omitted_count?: number };
};
export type RelationGroup = {
  relation: RelationName;
  state: "not_loaded" | "loading" | "loaded" | "unavailable" | "failed";
  candidates: readonly RelationCandidate[];
  omitted_count: number;
};

type RelationContext = {
  view_id: string;
  handle: string;
  supported: readonly RelationName[];
  unavailable: readonly RelationName[];
};

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Stores relation data by the immutable focus view and dispatches no follow request until a group opens. */
export class BrowserRelationsController {
  private readonly groups = new Map<RelationName, RelationGroup>();
  private readonly pending = new Map<RelationName, Promise<RelationGroup>>();

  constructor(
    private readonly context: RelationContext,
    private readonly follow: (request: {
      view_id: string;
      handle: string;
      relation: RelationName;
      limit: number;
    }) => Promise<RelationReply>,
  ) {
    for (const relation of context.supported)
      this.groups.set(relation, { relation, state: "not_loaded", candidates: [], omitted_count: 0 });
    for (const relation of context.unavailable)
      this.groups.set(relation, { relation, state: "unavailable", candidates: [], omitted_count: 0 });
  }

  state(relation: RelationName): RelationGroup {
    return this.groups.get(relation) ?? { relation, state: "unavailable", candidates: [], omitted_count: 0 };
  }

  async open(relation: RelationName): Promise<RelationGroup> {
    const current = this.state(relation);
    if (current.state === "unavailable" || current.state === "loaded") return current;
    const active = this.pending.get(relation);
    if (active) return active;
    this.groups.set(relation, { ...current, state: "loading" });
    const request = this.load(relation);
    this.pending.set(relation, request);
    try {
      return await request;
    } finally {
      this.pending.delete(relation);
    }
  }

  private async load(relation: RelationName): Promise<RelationGroup> {
    try {
      const reply = await this.follow({
        view_id: this.context.view_id,
        handle: this.context.handle,
        relation,
        limit: 200,
      });
      if (reply.state !== "ok") return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
      return this.save({
        relation,
        state: "loaded",
        candidates: reply.data?.candidates ?? [],
        omitted_count: reply.data?.omitted_count ?? 0,
      });
    } catch {
      return this.save({ relation, state: "failed", candidates: [], omitted_count: 0 });
    }
  }

  private save(group: RelationGroup): RelationGroup {
    this.groups.set(group.relation, group);
    return group;
  }
}

/** Renders only local candidates as focusable rows. External candidates expose display identity without source-derived detail. */
export function renderRelationGroup(group: RelationGroup): string {
  if (group.state !== "loaded")
    return `<section data-relation="${group.relation}" data-state="${group.state}">${group.state}</section>`;
  const rows = group.candidates
    .map((candidate) => {
      const name = escapeText(candidate.name);
      if (candidate.external) return `<li data-external="true">${name}</li>`;
      return `<li data-focus="${escapeText(candidate.local_handle ?? "")}">${name}</li>`;
    })
    .join("");
  const omitted = group.omitted_count > 0 ? `<p>${group.omitted_count} omitted</p>` : "";
  return `<section data-relation="${group.relation}" data-state="loaded"><ul>${rows}</ul>${omitted}</section>`;
}
