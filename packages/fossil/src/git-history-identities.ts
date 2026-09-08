import type { GitCommit, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/index.js";
import { activityForState } from "./git-history-activity.js";
import {
  type IdentityContext,
  recordChange,
} from "./git-history-identity-recording.js";
import { sortCommitsChronologically } from "./git-history-order.js";

export function resolveLogicalActivities(
  commits: readonly GitCommit[],
): LogicalIdentityResolution {
  const context: IdentityContext = {
    activeByPath: new Map(),
    generationsByPath: new Map(),
    identitiesByChange: new Map(),
    states: new Map(),
  };
  for (const commit of sortCommitsChronologically(commits)) {
    for (const change of commit.changes) recordChange(change, commit, context);
  }
  return {
    identitiesByChange: context.identitiesByChange,
    activities: [...context.states.values()].map(activityForState),
  };
}

/** Collapses rename chains while keeping copies and recreations distinct. */
export function resolveRenameActivities(
  commits: readonly GitCommit[],
): LogicalFileActivity[] {
  return [...resolveLogicalActivities(commits).activities];
}
