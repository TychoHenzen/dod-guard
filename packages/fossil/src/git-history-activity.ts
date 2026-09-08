import type { LogicalFileActivity } from "./types.js";
import type { LogicalIdentityState } from "./git-history-types/logical-identity-state.js";

export function activityForState(state: LogicalIdentityState): LogicalFileActivity {
  const timestamps = state.events.map(({ commit }) => commit.committerTimestampMs);
  return {
    identity: state.identity,
    currentPath: state.currentPath,
    paths: state.paths,
    firstCommitTimestampMs: Math.min(...timestamps),
    lastCommitTimestampMs: Math.max(...timestamps),
    commitCount: new Set(state.events.map(({ commit }) => commit.hash)).size,
    created: state.events.some(({ change }) => change.status === "added" || change.status === "copied"),
    deleted: state.currentPath === undefined,
    existsAtHead: state.currentPath !== undefined,
  };
}
