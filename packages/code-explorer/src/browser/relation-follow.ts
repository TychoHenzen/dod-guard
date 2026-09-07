import { browserRequest } from "./browser-request.js";
import type { RelationName } from "./relation-name.js";
import type { RelationReply } from "./relation-reply.js";
import { relationCandidates } from "./relation-data.js";
import type { BrowserStorage } from "./session.js";

export async function followRelation(
  storage: BrowserStorage,
  request: {
    view_id: string;
    handle: string;
    relation: RelationName;
    limit: number;
  },
): Promise<RelationReply> {
  const reply = await browserRequest(storage, "api/follow", {
    request_id: crypto.randomUUID(),
    ...request,
  });
  const data = Object(reply.data) as Record<string, unknown>;
  return {
    state: reply.state === "unavailable_relation" ? reply.state : "ok",
    project_generation: reply.project_generation,
    data: {
      candidates: relationCandidates(data),
      omitted_count:
        typeof data.omitted_count === "number" ? data.omitted_count : 0,
    },
  };
}
