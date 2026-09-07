import type { Session } from "./session-state.js";

export type OldestEviction = {
  session: Session;
  viewId: string;
  index: number;
};
