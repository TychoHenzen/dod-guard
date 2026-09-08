import type { GitCommit, GitFileChange } from "./types.js";
import type {
  LogicalIdentityState,
} from "./git-history-types/logical-identity-state.js";

export interface IdentityContext {
  activeByPath: Map<string, string>;
  generationsByPath: Map<string, number>;
  identitiesByChange: Map<GitFileChange, string>;
  states: Map<string, LogicalIdentityState>;
}

function createIdentity(path: string, context: IdentityContext): string {
  const generation = (context.generationsByPath.get(path) ?? 0) + 1;
  context.generationsByPath.set(path, generation);
  const identity = generation === 1 ? path : `${path}#${generation}`;
  context.states.set(identity, {
    identity,
    paths: [path],
    events: [],
    currentPath: path,
  });
  context.activeByPath.set(path, identity);
  return identity;
}

function activeIdentity(path: string, context: IdentityContext): string {
  return context.activeByPath.get(path) ?? createIdentity(path, context);
}

function recordPaths(state: LogicalIdentityState, change: GitFileChange): void {
  if (change.status === "renamed") {
    const previousPath = change.previousPath;
    if (previousPath && state.paths.at(-1) !== previousPath)
      state.paths.push(previousPath);
  }
  if (state.paths.at(-1) !== change.path) state.paths.push(change.path);
}

function record(input: {
  identity: string;
  change: GitFileChange;
  commit: GitCommit;
  context: IdentityContext;
}): void {
  const state = input.context.states.get(input.identity);
  if (!state) throw new Error(`Missing logical identity: ${input.identity}`);
  state.events.push({ change: input.change, commit: input.commit });
  input.context.identitiesByChange.set(input.change, input.identity);
  recordPaths(state, input.change);
}

function recordRename(
  change: GitFileChange,
  commit: GitCommit,
  context: IdentityContext,
): void {
  const sourcePath = change.previousPath ?? change.path;
  const identity = activeIdentity(sourcePath, context);
  context.activeByPath.delete(sourcePath);
  context.activeByPath.set(change.path, identity);
  const state = context.states.get(identity);
  if (state) state.currentPath = change.path;
  record({ identity, change, commit, context });
}

function recordDeleted(
  change: GitFileChange,
  identity: string,
  context: IdentityContext,
): void {
  context.activeByPath.delete(change.path);
  const state = context.states.get(identity);
  if (state) state.currentPath = undefined;
}

export function recordChange(
  change: GitFileChange,
  commit: GitCommit,
  context: IdentityContext,
): void {
  if (change.status === "renamed") {
    recordRename(change, commit, context);
    return;
  }
  if (change.status === "copied" || change.status === "added") {
    const identity = createIdentity(change.path, context);
    record({ identity, change, commit, context });
    return;
  }
  const identity = activeIdentity(change.path, context);
  record({ identity, change, commit, context });
  if (change.status === "deleted") recordDeleted(change, identity, context);
}
