import { sortCommitsChronologically } from "./git-history-order.js";
export function resolveLogicalActivities(commits) {
    const activeByPath = new Map();
    const generationsByPath = new Map();
    const identitiesByChange = new Map();
    const states = new Map();
    const createIdentity = (path) => {
        const generation = (generationsByPath.get(path) ?? 0) + 1;
        generationsByPath.set(path, generation);
        const identity = generation === 1 ? path : `${path}#${generation}`;
        states.set(identity, { identity, paths: [path], events: [], currentPath: path });
        activeByPath.set(path, identity);
        return identity;
    };
    const activeIdentity = (path) => activeByPath.get(path) ?? createIdentity(path);
    const record = (identity, change, commit) => {
        const state = states.get(identity);
        if (!state)
            throw new Error(`Missing logical identity: ${identity}`);
        state.events.push({ change, commit });
        identitiesByChange.set(change, identity);
        if (change.status === "renamed" && change.previousPath && state.paths.at(-1) !== change.previousPath)
            state.paths.push(change.previousPath);
        if (state.paths.at(-1) !== change.path)
            state.paths.push(change.path);
    };
    for (const commit of sortCommitsChronologically(commits)) {
        for (const change of commit.changes) {
            if (change.status === "renamed") {
                const sourcePath = change.previousPath ?? change.path;
                const identity = activeIdentity(sourcePath);
                activeByPath.delete(sourcePath);
                activeByPath.set(change.path, identity);
                const state = states.get(identity);
                if (state)
                    state.currentPath = change.path;
                record(identity, change, commit);
                continue;
            }
            if (change.status === "copied") {
                const identity = createIdentity(change.path);
                record(identity, change, commit);
                continue;
            }
            if (change.status === "added") {
                const identity = createIdentity(change.path);
                record(identity, change, commit);
                continue;
            }
            const identity = activeIdentity(change.path);
            record(identity, change, commit);
            if (change.status === "deleted") {
                activeByPath.delete(change.path);
                const state = states.get(identity);
                if (state)
                    state.currentPath = undefined;
            }
        }
    }
    return {
        identitiesByChange,
        activities: [...states.values()].map((state) => {
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
        }),
    };
}
/** Collapses rename chains while keeping copies and path recreations as distinct identities. */
export function resolveRenameActivities(commits) {
    return [...resolveLogicalActivities(commits).activities];
}
//# sourceMappingURL=git-history-identities.js.map