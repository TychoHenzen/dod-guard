import type { RelationName } from "./relation-name.js";

export type RelationContext = {
  view_id: string;
  handle: string;
  supported: readonly RelationName[];
  unavailable: readonly RelationName[];
};
