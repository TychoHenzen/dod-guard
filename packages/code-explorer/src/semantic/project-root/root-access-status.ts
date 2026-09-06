import type { RootAccessState } from "./root-access-state.js";

export type RootAccessStatus = {
  state: RootAccessState;
  restart_required: boolean;
};

export function rootAccessStatus(state: RootAccessState): RootAccessStatus {
  return {
    state,
    restart_required: state === "project_root_unavailable",
  };
}
