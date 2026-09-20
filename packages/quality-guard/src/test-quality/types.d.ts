import { EvidenceSchema } from "./schema/schema.js";

export type Evidence = ReturnType<typeof EvidenceSchema.parse>;
export type Facts = {
  sources: Set<string>;
  behaviors: Map<string, string>;
};
