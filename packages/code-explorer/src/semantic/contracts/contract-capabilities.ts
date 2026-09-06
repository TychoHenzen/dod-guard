import type { RelationName } from "./contract-relation-name.js";

export type RelationCapabilities = Record<
  RelationName,
  | { state: "ready" }
  | { state: "unavailable" }
  | { state: "failed"; failure_code: string }
>;
