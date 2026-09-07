import type { RelationGroup } from "./relation-group.js";
import type { RelationName } from "./relation-name.js";
import type { RelationReply } from "./relation-reply.js";

export function loadedRelationGroup(
  relation: RelationName,
  reply: RelationReply,
): RelationGroup {
  if (reply.state !== "ok")
    return { relation, state: "failed", candidates: [], omitted_count: 0 };
  return {
    relation,
    state: "loaded",
    candidates: loadedCandidates(reply),
    omitted_count: omittedCount(reply),
  };
}

function loadedCandidates(reply: RelationReply): RelationGroup["candidates"] {
  return (reply.data?.candidates ?? []).map((candidate) =>
    withGeneration(candidate, reply.project_generation),
  );
}

function omittedCount(reply: RelationReply): number {
  return reply.data?.omitted_count ?? 0;
}

function withGeneration(
  candidate: RelationGroup["candidates"][number],
  generation: number | undefined,
): RelationGroup["candidates"][number] {
  if (candidate.project_generation !== undefined || generation === undefined)
    return candidate;
  return { ...candidate, project_generation: generation };
}
