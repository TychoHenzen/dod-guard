import type { RelationContext } from "./relation-context.js";
import { loadedRelationGroup } from "./relation-controller-reply.js";
import type { RelationGroup } from "./relation-group.js";
import type { RelationName } from "./relation-name.js";
import type { RelationReply } from "./relation-reply.js";

/** Stores relation data by immutable focus view and dispatches no follow
 * request until a group opens.
 */
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
      this.groups.set(relation, {
        relation,
        state: "not_loaded",
        candidates: [],
        omitted_count: 0,
      });
    for (const relation of context.unavailable)
      this.groups.set(relation, {
        relation,
        state: "unavailable",
        candidates: [],
        omitted_count: 0,
      });
  }

  state(relation: RelationName): RelationGroup {
    return (
      this.groups.get(relation) ?? {
        relation,
        state: "unavailable",
        candidates: [],
        omitted_count: 0,
      }
    );
  }

  async open(relation: RelationName): Promise<RelationGroup> {
    const current = this.state(relation);
    if (current.state === "unavailable" || current.state === "loaded")
      return current;
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
      return this.save(loadedRelationGroup(relation, reply));
    } catch {
      return this.save({
        relation,
        state: "failed",
        candidates: [],
        omitted_count: 0,
      });
    }
  }

  private save(group: RelationGroup): RelationGroup {
    this.groups.set(group.relation, group);
    return group;
  }
}
