import type { BurstFileActivity, GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";

const RECORD_SEPARATOR = "\u001e";
const MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1_000;
const MAX_CHANGE_POINT_SIMILARITY = 0.1;

/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export function nonMergeGitLogArguments(): readonly string[] {
  return ["log", "HEAD", "--no-merges", "--find-renames=50%", "--format=%x1e%H%x00%ct%x00", "--name-status", "-z"];
}

function statusFor(rawStatus: string): GitFileChange["status"] {
  switch (rawStatus[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}

function parseChanges(tokens: readonly string[]): GitFileChange[] {
  const changes: GitFileChange[] = [];
  for (let index = 0; index < tokens.length; ) {
    const rawStatus = tokens[index]?.replace(/^\r?\n/, "");
    if (!rawStatus) {
      index += 1;
      continue;
    }
    const status = statusFor(rawStatus);
    const firstPath = tokens[index + 1];
    if (firstPath === undefined) break;
    if (status === "renamed" || status === "copied") {
      const path = tokens[index + 2];
      if (path === undefined) break;
      changes.push({ status, path, previousPath: firstPath });
      index += 3;
      continue;
    }
    changes.push({ status, path: firstPath });
    index += 2;
  }
  return changes;
}

/** Parses the NUL-delimited non-merge stream requested by nonMergeGitLogArguments(). */
export function parseNonMergeGitLog(rawLog: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const record of rawLog.split(RECORD_SEPARATOR)) {
    if (!record) continue;
    const tokens = record.split("\0");
    const hash = tokens[0];
    const committerSeconds = Number(tokens[1]);
    if (!(hash && Number.isFinite(committerSeconds))) continue;
    commits.push({
      hash,
      committerTimestampMs: committerSeconds * 1_000,
      changes: parseChanges(tokens.slice(2)),
    });
  }
  return commits;
}

function pathExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

/** Keeps whole candidate identities for later burst and score calculations. */
export function filterHistoryByExtensions(commits: readonly GitCommit[], extensions: ReadonlySet<string>): GitCommit[] {
  if (extensions.size === 0) return [...commits];
  const selectedPaths = new Set(
    resolveRenameActivities(commits)
      .filter((activity) => extensions.has(pathExtension(activity.currentPath ?? activity.paths.at(-1) ?? "")))
      .flatMap((activity) => activity.paths),
  );
  return commits.flatMap((commit) => {
    const changes = commit.changes.filter((change) => selectedPaths.has(change.path));
    return changes.length === 0 ? [] : [{ ...commit, changes }];
  });
}

/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  const clusters: GitCommit[][] = [];
  for (const commit of commits) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (!(current && previous) || commit.committerTimestampMs - previous.committerTimestampMs > gapMilliseconds) {
      clusters.push([commit]);
      continue;
    }
    current.push(commit);
  }
  return clusters;
}

function fileIdentities(commits: readonly GitCommit[]): Map<string, string> {
  const identities = new Map<string, string>();
  for (const activity of resolveRenameActivities(commits)) {
    for (const path of activity.paths) identities.set(path, activity.identity);
  }
  return identities;
}

function commitFiles(commit: GitCommit, identities: ReadonlyMap<string, string>): Set<string> {
  return new Set(commit.changes.map((change) => identities.get(change.path) ?? change.path));
}

function partitionQualifies(commits: readonly GitCommit[], identities: ReadonlyMap<string, string>): boolean {
  return commits.length >= 5 && new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)])).size >= 3;
}

function weightedSimilarity(
  commits: readonly GitCommit[],
  cut: number,
  identities: ReadonlyMap<string, string>,
): number {
  const touchedByCommit = commits.map((commit) => commitFiles(commit, identities));
  const touches = new Map<string, number>();
  for (const files of touchedByCommit) {
    for (const file of files) touches.set(file, (touches.get(file) ?? 0) + 1);
  }
  const left = new Set(touchedByCommit.slice(cut - 5, cut).flatMap((files) => [...files]));
  const right = new Set(touchedByCommit.slice(cut, cut + 5).flatMap((files) => [...files]));
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  const weightFor = (file: string) => Math.log((1 + commits.length) / (1 + (touches.get(file) ?? 0))) + 1;
  const intersectionWeight = [...left]
    .filter((file) => right.has(file))
    .reduce((total, file) => total + weightFor(file), 0);
  const unionWeight = [...union].reduce((total, file) => total + weightFor(file), 0);
  return intersectionWeight / unionWeight;
}

interface ChangePointCandidate {
  readonly cut: number;
  readonly gapMilliseconds: number;
  readonly similarity: number;
}

function selectChangePoint(
  commits: readonly GitCommit[],
  start: number,
  end: number,
  identities: ReadonlyMap<string, string>,
): ChangePointCandidate | undefined {
  const candidates: ChangePointCandidate[] = [];
  for (let cut = start + 5; cut <= end - 5; cut += 1) {
    const left = commits.slice(start, cut);
    const right = commits.slice(cut, end);
    const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
    if (
      gapMilliseconds < MIN_CHANGE_POINT_GAP_MS ||
      !partitionQualifies(left, identities) ||
      !partitionQualifies(right, identities)
    )
      continue;
    const similarity = weightedSimilarity(commits, cut, identities);
    if (similarity <= MAX_CHANGE_POINT_SIMILARITY) candidates.push({ cut, gapMilliseconds, similarity });
  }
  return candidates.sort(
    (left, right) =>
      left.similarity - right.similarity || right.gapMilliseconds - left.gapMilliseconds || left.cut - right.cut,
  )[0];
}

function splitChangePoints(
  commits: readonly GitCommit[],
  start: number,
  end: number,
  identities: ReadonlyMap<string, string>,
): GitCommit[][] {
  const candidate = selectChangePoint(commits, start, end, identities);
  if (!candidate) return [commits.slice(start, end)];
  return [
    ...splitChangePoints(commits, start, candidate.cut, identities),
    ...splitChangePoints(commits, candidate.cut, end, identities),
  ];
}

/** Splits qualifying close file-set changes in deterministic chronological order. */
export function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][] {
  return splitChangePoints(commits, 0, commits.length, fileIdentities(commits));
}

/** Retains only clusters whose closed state was established by the caller. */
export function retainQualifiedClosedClusters(clusters: readonly (readonly GitCommit[])[]): GitCommit[][] {
  const identities = fileIdentities(clusters.flat());
  return clusters.filter((cluster) => partitionQualifies(cluster, identities)).map((cluster) => [...cluster]);
}

/** Retains temporal clusters that have remained inactive for the full configured gap. */
export function retainClosedTemporalClusters(
  clusters: readonly (readonly GitCommit[])[],
  analysisTimestampMs: number,
  gapMilliseconds: number,
): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  return clusters
    .filter((cluster) => {
      const newest = cluster.at(-1);
      return newest !== undefined && analysisTimestampMs - newest.committerTimestampMs >= gapMilliseconds;
    })
    .map((cluster) => [...cluster]);
}

/** Selects files that meet the absolute post-burst survivor threshold. */
export function selectAbsoluteSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  return files.filter((file) => file.postBurstCommits >= 3);
}

function maximumPostBurstCommits(files: readonly BurstFileActivity[]): number {
  return Math.max(0, ...files.map((file) => file.postBurstCommits));
}

/** Selects files meeting the positive relative post-burst survivor threshold. */
export function selectRelativeSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return maximum > 0 ? files.filter((file) => file.postBurstCommits >= 0.2 * maximum) : [];
}

/** Selects files meeting either the absolute or positive relative survivor threshold. */
export function selectSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return files.filter((file) => file.postBurstCommits >= 3 || (maximum > 0 && file.postBurstCommits >= 0.2 * maximum));
}

interface FileEvent {
  readonly change: GitFileChange;
  readonly commit: GitCommit;
}

function pathHistory(events: readonly FileEvent[]): string[] {
  const nextByPath = new Map<string, string>();
  const renamedTo = new Set<string>();
  const paths = new Set<string>();
  for (const { change } of events) {
    paths.add(change.path);
    if (change.status !== "renamed" || !change.previousPath) continue;
    paths.add(change.previousPath);
    nextByPath.set(change.previousPath, change.path);
    renamedTo.add(change.path);
  }
  const ordered: string[] = [];
  for (const start of [...nextByPath.keys()].filter((path) => !renamedTo.has(path)).sort()) {
    let current: string | undefined = start;
    while (current && !ordered.includes(current)) {
      ordered.push(current);
      current = nextByPath.get(current);
    }
  }
  return [...ordered, ...[...paths].filter((path) => !ordered.includes(path)).sort()];
}

function createRootResolver(commits: readonly GitCommit[]) {
  const parent = new Map<string, string>();
  const rootFor = (path: string): string => {
    const knownParent = parent.get(path);
    if (!knownParent) {
      parent.set(path, path);
      return path;
    }
    if (knownParent === path) return path;
    const root = rootFor(knownParent);
    parent.set(path, root);
    return root;
  };
  for (const commit of commits) {
    for (const change of commit.changes) {
      rootFor(change.path);
      if (change.status === "renamed" && change.previousPath)
        parent.set(rootFor(change.path), rootFor(change.previousPath));
    }
  }
  return rootFor;
}

/** Collapses Git-reported rename chains while keeping copies and unrelated paths distinct. */
export function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[] {
  const rootFor = createRootResolver(commits);
  const eventsByIdentity = new Map<string, FileEvent[]>();
  for (const commit of commits) {
    for (const change of commit.changes) {
      const identity = rootFor(change.path);
      const events = eventsByIdentity.get(identity) ?? [];
      events.push({ change, commit });
      eventsByIdentity.set(identity, events);
    }
  }
  return [...eventsByIdentity.entries()].map(([identity, events]) => {
    const paths = pathHistory(events);
    const timestamps = events.map(({ commit }) => commit.committerTimestampMs);
    const latest = events.reduce((current, event) =>
      event.commit.committerTimestampMs > current.commit.committerTimestampMs ? event : current,
    );
    const deleted = latest.change.status === "deleted";
    return {
      identity,
      currentPath: deleted ? undefined : paths.at(-1),
      paths,
      firstCommitTimestampMs: Math.min(...timestamps),
      lastCommitTimestampMs: Math.max(...timestamps),
      commitCount: new Set(events.map(({ commit }) => commit.hash)).size,
      created: events.some(({ change }) => change.status === "added"),
      deleted,
      existsAtHead: !deleted,
    };
  });
}
