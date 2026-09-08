import type { GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/logical-identity-resolution.js";
import type { LogicalIdentityState } from "./git-history-types/logical-identity-state.js";
import { activityForState } from "./git-history-activity.js";
import { sortCommitsChronologically } from "./git-history-order.js";

interface IdentityContext {
  activeByPath: Map<string, string>;
  generationsByPath: Map<string, number>;
  identitiesByChange: Map<GitFileChange, string>;
  states: Map<string, LogicalIdentityState>;
}

function createIdentity(path: string, context: IdentityContext): string {
  const generation = (context.generationsByPath.get(path) ?? 0) + 1;
  context.generationsByPath.set(path, generation);
  const identity = generation === 1 ? path : `${path}#${generation}`;
  context.states.set(identity, { identity, paths: [path], events: [], currentPath: path });
  context.activeByPath.set(path, identity);
  return identity;
}

function activeIdentity(path: string, context: IdentityContext): string {
  return context.activeByPath.get(path) ?? createIdentity(path, context);
}

function recordPaths(state: LogicalIdentityState, change: GitFileChange): void {
  if (change.status === "renamed") {
    const previousPath = change.previousPath;
    if (previousPath && state.paths.at(-1) !== previousPath) state.paths.push(previousPath);
  }
  if (state.paths.at(-1) !== change.path) state.paths.push(change.path);
}

function record(identity: string, change: GitFileChange, commit: GitCommit, context: IdentityContext): void {
  const state = context.states.get(identity);
  if (!state) throw new Error(`Missing logical identity: ${identity}`);
  state.events.push({ change, commit });
  context.identitiesByChange.set(change, identity);
  recordPaths(state, change);
}

function recordRename(change: GitFileChange, commit: GitCommit, context: IdentityContext): void {
  const sourcePath = change.previousPath ?? change.path;
  const identity = activeIdentity(sourcePath, context);
  context.activeByPath.delete(sourcePath);
  context.activeByPath.set(change.path, identity);
  const state = context.states.get(identity);
  if (state) state.currentPath = change.path;
  record(identity, change, commit, context);
}

function recordDeleted(change: GitFileChange, identity: string, context: IdentityContext): void {
  context.activeByPath.delete(change.path);
  const state = context.states.get(identity);
  if (state) state.currentPath = undefined;
}

function recordChange(change: GitFileChange, commit: GitCommit, context: IdentityContext): void {
  if (change.status === "renamed") {
    recordRename(change, commit, context);
    return;
  }
  if (change.status === "copied" || change.status === "added") {
    const identity = createIdentity(change.path, context);
    record(identity, change, commit, context);
    return;
  }
  const identity = activeIdentity(change.path, context);
  record(identity, change, commit, context);
  if (change.status === "deleted") recordDeleted(change, identity, context);
}

export function resolveLogicalActivities(commits: readonly GitCommit[]): LogicalIdentityResolution {
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

/** Collapses rename chains while keeping copies and path recreations as distinct identities. */
export function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[] {
  return [...resolveLogicalActivities(commits).activities];
}
